import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

import { getScan, updateScan, addBroken, finishScan } from "./scanStore";
import { broadcastToScan } from "./ws";

function shouldVisit(url, options) {
  if (!options) return true;

  const {
    urlStartsWith = [],
    urlNotStartsWith = [],
    urlIncludes = [],
    urlExclude = [],
  } = options;

  if (urlNotStartsWith.some((p) => url.startsWith(p))) return false;
  if (urlExclude.some((p) => url.includes(p))) return false;
  if (urlStartsWith.length > 0 && !urlStartsWith.some((p) => url.startsWith(p))) return false;
  if (urlIncludes.length > 0 && !urlIncludes.some((p) => url.includes(p))) return false;

  return true;
}

async function getSitemapUrls(startUrl, options = {}) {
  const visitedSitemaps = new Set();
  const finalUrls = new Set();

  async function crawlSitemap(sitemapUrl) {
    if (visitedSitemaps.has(sitemapUrl)) return;
    visitedSitemaps.add(sitemapUrl);

    try {
      const res = await axios.get(sitemapUrl, { timeout: 10000 });
      const xml = res.data;
      const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]?.trim());

      for (const loc of locs) {
        if (!loc) continue;
        if (loc.includes(".xml")) {
          await crawlSitemap(loc);
        } else {
          if (shouldVisit(loc, options)) finalUrls.add(loc);
        }
      }
    } catch {
      console.log("sitemap read failed:", sitemapUrl);
    }
  }

  await crawlSitemap(startUrl);
  return [...finalUrls];
}

/**
 * Maps a network error code to a human-readable category string.
 */
function classifyError(err) {
  const code = err?.code;
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return "TIMEOUT";
  if (code === "ENOTFOUND") return "DNS_ERROR";
  if (code === "ECONNREFUSED") return "CONN_REFUSED";
  if (
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    code === "CERT_HAS_EXPIRED" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    err?.message?.includes("certificate")
  )
    return "SSL_ERROR";
  return "ERROR";
}

/**
 * Checks a URL by manually following redirects one hop at a time.
 * - Tries HEAD first; falls back to GET on 405.
 * - Retries once on network failure before marking as error.
 * - Returns status, response time, final URL (if redirected), and redirect count.
 */
async function checkLink(url, userAgent = "") {
  const t0 = Date.now();
  let current = url;
  let redirectCount = 0;

  const baseOpts = {
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 10000,
    ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
  };

  const attempt = (method, u) => axios({ method, url: u, ...baseOpts });

  for (let hop = 0; hop <= 10; hop++) {
    let res;

    try {
      res = await attempt("head", current);
    } catch (err) {
      // HEAD failed — retry once with GET before giving up
      try {
        res = await attempt("get", current);
      } catch (err2) {
        return {
          status: classifyError(err2),
          responseTime: Date.now() - t0,
          finalUrl: redirectCount > 0 ? current : undefined,
          redirectCount,
        };
      }
    }

    // HEAD not supported by this server — fall back to GET
    if (res.status === 405) {
      try {
        res = await attempt("get", current);
      } catch (err) {
        return {
          status: classifyError(err),
          responseTime: Date.now() - t0,
          finalUrl: redirectCount > 0 ? current : undefined,
          redirectCount,
        };
      }
    }

    // Follow redirect manually so we can record the chain
    if (res.status >= 300 && res.status < 400 && res.headers?.location) {
      try {
        current = new URL(res.headers.location, current).href;
        redirectCount++;
        continue;
      } catch {
        // Malformed Location header — report the 3xx as the final status
        return {
          status: res.status,
          responseTime: Date.now() - t0,
          finalUrl: redirectCount > 0 ? current : undefined,
          redirectCount,
        };
      }
    }

    return {
      status: res.status,
      responseTime: Date.now() - t0,
      finalUrl: redirectCount > 0 ? current : undefined,
      redirectCount,
    };
  }

  // Guard against infinite redirect loops
  return {
    status: "REDIRECT_LOOP",
    responseTime: Date.now() - t0,
    finalUrl: current,
    redirectCount,
  };
}

/**
 * Extracts all checkable resources from a loaded cheerio page.
 * Always extracts <a href> links.
 * Optionally extracts <img src>, <script src>, <link rel="stylesheet">.
 */
function extractResources($, pageUrl, checkResources = true) {
  const items = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    )
      return;

    try {
      let text = $(el).clone().children().remove().end().text().trim();

      if (!text) {
        text =
          $(el)
            .children()
            .toArray()
            .map((child) =>
              $(child)
                .contents()
                .filter((_, node) => node.type === "text")
                .text()
                .trim(),
            )
            .find((t) => /[a-zA-Z]/.test(t)) || "";
      }

      items.push({ url: new URL(href, pageUrl).href, text, type: "link" });
    } catch {}
  });

  if (!checkResources) return items;

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith("data:")) return;
    try {
      items.push({
        url: new URL(src, pageUrl).href,
        text: $(el).attr("alt") || "",
        type: "image",
      });
    } catch {}
  });

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    try {
      items.push({ url: new URL(src, pageUrl).href, text: "", type: "script" });
    } catch {}
  });

  $('link[rel="stylesheet"][href]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      items.push({ url: new URL(href, pageUrl).href, text: "", type: "style" });
    } catch {}
  });

  return items;
}

export async function runCrawler(startUrl, scanId, options = {}) {
  const checkedLinksSet = new Set();
  const visitedPages = new Set();

  // Queue items: { url, depth }
  let queue = [];
  let checkedPages = 0;
  let checkedLinks = 0;
  let redirectedCount = 0;

  const concurrency = Math.min(Math.max(Number(options.concurrency) || 10, 1), 50);
  const maxDepth = Number(options.maxDepth) || 0; // 0 = unlimited
  const crawlDelay = Number(options.crawlDelay) || 0; // ms between page fetches
  const userAgent = options.userAgent?.trim() || "";
  const checkExternal = options.checkExternal !== false; // default: true
  const checkResources = options.checkResources !== false; // default: true

  const limit = pLimit(concurrency);

  const baseHost = new URL(startUrl).host;
  const sitemap = startUrl.endsWith(".xml") || startUrl.includes(".xml?");

  if (sitemap) {
    const urls = await getSitemapUrls(startUrl, options);
    queue = urls.map((u) => ({ url: u, depth: 0 }));
  } else {
    queue = [{ url: startUrl, depth: 0 }];
  }

  while (queue.length) {
    const scan = getScan(scanId);
    if (!scan || scan.stopped) break;

    while (scan.paused) {
      await new Promise((r) => setTimeout(r, 500));
      const latest = getScan(scanId);
      if (!latest || latest.stopped) break;
    }

    const { url: page, depth } = queue.shift() || {};

    if (!page) continue;
    if (visitedPages.has(page)) continue;
    if (!shouldVisit(page, options)) continue;

    visitedPages.add(page);
    checkedPages++;

    updateScan(scanId, { checkedPages, checkedLinks, currentPage: page });
    broadcastToScan(scanId, { type: "progress", checkedPages, checkedLinks, currentPage: page, redirectedCount });

    let html = "";

    try {
      const res = await axios.get(page, {
        timeout: 10000,
        ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
      });
      html = res.data;
    } catch {
      continue;
    }

    const $ = cheerio.load(html);
    const resources = extractResources($, page, checkResources);

    await Promise.all(
      resources.map((item) =>
        limit(async () => {
          const currentScan = getScan(scanId);
          if (!currentScan || currentScan.stopped) return;

          const link = item.url;
          const linkText = item.text || "";
          const linkType = item.type;

          // Skip external resources when option is off
          if (!checkExternal) {
            try {
              if (new URL(link).host !== baseHost) return;
            } catch {
              return;
            }
          }

          if (!checkedLinksSet.has(link)) {
            checkedLinksSet.add(link);

            const result = await checkLink(link, userAgent);
            checkedLinks++;

            const isBroken =
              result.status === "ERROR" ||
              result.status === "TIMEOUT" ||
              result.status === "DNS_ERROR" ||
              result.status === "CONN_REFUSED" ||
              result.status === "SSL_ERROR" ||
              result.status === "REDIRECT_LOOP" ||
              (typeof result.status === "number" && result.status >= 400);

            if (!isBroken && result.redirectCount > 0) {
              redirectedCount++;
            }

            updateScan(scanId, { checkedPages, checkedLinks, redirectedCount });
            broadcastToScan(scanId, {
              type: "progress",
              checkedPages,
              checkedLinks,
              currentPage: page,
              redirectedCount,
            });

            if (isBroken) {
              const broken = {
                url: link,
                text: linkText,
                type: linkType,
                status: result.status,
                finalUrl: result.finalUrl,
                redirectCount: result.redirectCount,
                responseTime: result.responseTime,
                source: page,
              };

              addBroken(scanId, broken);
              broadcastToScan(scanId, { type: "broken", data: broken });
            }
          }

          // Only crawl deeper for internal <a href> links
          if (!sitemap && linkType === "link") {
            try {
              const host = new URL(link).host;
              const withinDepth = !maxDepth || depth < maxDepth;

              if (
                host === baseHost &&
                !visitedPages.has(link) &&
                shouldVisit(link, options) &&
                withinDepth
              ) {
                queue.push({ url: link, depth: depth + 1 });
              }
            } catch {}
          }
        }),
      ),
    );

    if (crawlDelay > 0) {
      await new Promise((r) => setTimeout(r, crawlDelay));
    }
  }

  finishScan(scanId);
  broadcastToScan(scanId, { type: "done" });
}
