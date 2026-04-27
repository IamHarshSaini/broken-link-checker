import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

import { getScan, updateScan, addBroken, finishScan } from "./scanStore";

import { broadcastToScan } from "./ws";

const limit = pLimit(100);

function shouldVisit(url, options) {
  if (!options) return true;

  const {
    urlStartsWith = [],
    urlNotStartsWith = [],
    urlIncludes = [],
    urlExclude = [],
  } = options;

  // exclude startsWith
  if (urlNotStartsWith.some((p) => url.startsWith(p))) {
    return false;
  }

  // exclude includes
  if (urlExclude.some((p) => url.includes(p))) {
    return false;
  }

  // include only startsWith
  if (
    urlStartsWith.length > 0 &&
    !urlStartsWith.some((p) => url.startsWith(p))
  ) {
    return false;
  }

  // include only includes
  if (urlIncludes.length > 0 && !urlIncludes.some((p) => url.includes(p))) {
    return false;
  }

  return true;
}

/**
 * recursive sitemap parser
 * supports:
 * - sitemap.xml
 * - sitemap index
 * - nested sitemap index
 */
async function getSitemapUrls(startUrl, options = {}) {
  const visitedSitemaps = new Set();
  const finalUrls = new Set();

  // use exact incoming sitemap URL
  const rootSitemap = startUrl;

  async function crawlSitemap(sitemapUrl) {
    if (visitedSitemaps.has(sitemapUrl)) return;
    visitedSitemaps.add(sitemapUrl);

    try {
      const res = await axios.get(sitemapUrl, {
        timeout: 10000,
      });

      const xml = res.data;

      const sitemapMatches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
        m[1]?.trim(),
      );

      for (const loc of sitemapMatches) {
        if (!loc) continue;

        // recursive nested sitemap support
        if (
          loc.includes("sitemap") &&
          (loc.endsWith(".xml") || loc.includes(".xml?"))
        ) {
          await crawlSitemap(loc);
        } else {
          if (shouldVisit(loc, options)) {
            finalUrls.add(loc);
          }
        }
      }
    } catch (err) {
      console.log("sitemap read failed:", sitemapUrl);
    }
  }

  await crawlSitemap(rootSitemap);

  return [...finalUrls];
}

export async function runCrawler(startUrl, scanId, options = {}) {
  const checkedLinksSet = new Set();
  const visitedPages = new Set();

  let queue = [];

  // separate counters
  let checkedPages = 0;
  let checkedLinks = 0;

  const baseHost = new URL(startUrl).host;

  /**
   * if sitemap=true
   * use only sitemap URLs
   */
  if (options?.sitemap) {
    queue = await getSitemapUrls(startUrl, options);
  } else {
    queue = [startUrl];
  }

  while (queue.length) {
    const scan = getScan(scanId);

    if (!scan) break;
    if (scan.stopped) break;

    // pause handling
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

    // page checked
    checkedPages++;

    updateScan(scanId, {
      checkedPages,
      checkedLinks,
      currentPage: page,
    });

    broadcastToScan(scanId, {
      type: "progress",
      checkedPages,
      checkedLinks,
      currentPage: page,
    });

    let html = "";

    try {
      const res = await axios.get(page, {
        timeout: 10000,
      });

      html = res.data;
    } catch {
      continue;
    }

    const $ = cheerio.load(html);
    const links = [];

    /**
     * capture:
     * - link URL
     * - anchor text
     */
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#")) return;
      try {
        const text = $(el)
          .contents()
          .filter((_, node) => node.type === "text")
          .text()
          .trim();

        links.push({
          url: new URL(href, page).href,
          text,
        });
      } catch {}
    });

    await Promise.all(
      links.map((item) =>
        limit(async () => {
          const link = item.url;
          const linkText = item.text || "";

          if (!checkedLinksSet.has(link)) {
            checkedLinksSet.add(link);

            try {
              const res = await axios.head(link, {
                timeout: 8000,
                validateStatus: () => true,
              });

              // link checked
              checkedLinks++;

              updateScan(scanId, {
                checkedPages,
                checkedLinks,
              });

              if (res.status >= 400) {
                const broken = {
                  url: link,
                  text: linkText, // anchor text
                  status: res.status,
                  source: page,
                };

                addBroken(scanId, broken);

                broadcastToScan(scanId, {
                  type: "broken",
                  data: broken,
                });
              }
            } catch {
              checkedLinks++;

              updateScan(scanId, {
                checkedPages,
                checkedLinks,
              });

              const broken = {
                url: link,
                text: linkText, // anchor text
                status: "ERROR",
                source: page,
              };

              addBroken(scanId, broken);

              broadcastToScan(scanId, {
                type: "broken",
                data: broken,
              });
            }
          }

          /**
           * only normal crawl when sitemap=false
           */
          if (!options?.sitemap) {
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

  broadcastToScan(scanId, {
    type: "done",
  });
}
