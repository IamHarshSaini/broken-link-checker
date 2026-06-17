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

      const sitemapMatches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
        m[1]?.trim(),
      );

      for (const loc of sitemapMatches) {
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
 * Check a single link. Tries HEAD first, falls back to GET on 405.
 * Retries once on network error to reduce false positives from transient failures.
 */
async function checkLink(url) {
  const attempt = async (method) =>
    axios({
      method,
      url,
      timeout: 10000,
      validateStatus: () => true,
      maxRedirects: 5,
    });

  try {
    const res = await attempt("head");

    // Some servers don't support HEAD — fall back to GET
    if (res.status === 405) {
      const getRes = await attempt("get");
      return getRes.status;
    }

    return res.status;
  } catch {
    // Retry once before reporting as ERROR
    try {
      const retryRes = await attempt("head");

      if (retryRes.status === 405) {
        const getRes = await attempt("get");
        return getRes.status;
      }

      return retryRes.status;
    } catch {
      return "ERROR";
    }
  }
}

export async function runCrawler(startUrl, scanId, options = {}) {
  const checkedLinksSet = new Set();
  const visitedPages = new Set();

  let queue = [];
  let checkedPages = 0;
  let checkedLinks = 0;

  const concurrency = Math.min(Math.max(Number(options.concurrency) || 10, 1), 50);
  const limit = pLimit(concurrency);

  const baseHost = new URL(startUrl).host;
  const sitemap = startUrl.endsWith(".xml") || startUrl.includes(".xml?");

  if (sitemap) {
    queue = await getSitemapUrls(startUrl, options);
  } else {
    queue = [startUrl];
  }

  while (queue.length) {
    const scan = getScan(scanId);

    if (!scan) break;
    if (scan.stopped) break;

    while (scan.paused) {
      await new Promise((r) => setTimeout(r, 500));

      const latest = getScan(scanId);
      if (!latest || latest.stopped) break;
    }

    const page = queue.shift();

    if (!page) continue;
    if (visitedPages.has(page)) continue;
    if (!shouldVisit(page, options)) continue;

    visitedPages.add(page);
    checkedPages++;

    updateScan(scanId, { checkedPages, checkedLinks, currentPage: page });

    broadcastToScan(scanId, {
      type: "progress",
      checkedPages,
      checkedLinks,
      currentPage: page,
    });

    let html = "";

    try {
      const res = await axios.get(page, { timeout: 10000 });
      html = res.data;
    } catch {
      continue;
    }

    const $ = cheerio.load(html);
    const links = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#")) return;
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
              .find((txt) => /[a-zA-Z]/.test(txt)) || "";
        }

        links.push({ url: new URL(href, page).href, text });
      } catch {}
    });

    await Promise.all(
      links.map((item) =>
        limit(async () => {
          // Bail out mid-batch if scan was stopped
          const currentScan = getScan(scanId);
          if (!currentScan || currentScan.stopped) return;

          const link = item.url;
          const linkText = item.text || "";

          if (!checkedLinksSet.has(link)) {
            checkedLinksSet.add(link);

            const status = await checkLink(link);
            checkedLinks++;

            updateScan(scanId, { checkedPages, checkedLinks });

            broadcastToScan(scanId, {
              type: "progress",
              checkedPages,
              checkedLinks,
              currentPage: page,
            });

            if (status === "ERROR" || (typeof status === "number" && status >= 400)) {
              const broken = { url: link, text: linkText, status, source: page };

              addBroken(scanId, broken);

              broadcastToScan(scanId, { type: "broken", data: broken });
            }
          }

          if (!sitemap) {
            try {
              const host = new URL(link).host;

              if (
                host === baseHost &&
                !visitedPages.has(link) &&
                shouldVisit(link, options)
              ) {
                queue.push(link);
              }
            } catch {}
          }
        }),
      ),
    );
  }

  finishScan(scanId);

  broadcastToScan(scanId, { type: "done" });
}
