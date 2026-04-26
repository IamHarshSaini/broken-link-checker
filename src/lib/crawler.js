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

  if (urlNotStartsWith.some((p) => url.startsWith(p))) {
    return false;
  }

  if (urlExclude.some((p) => url.includes(p))) {
    return false;
  }

  if (
    urlStartsWith.length > 0 &&
    !urlStartsWith.some((p) => url.startsWith(p))
  ) {
    return false;
  }

  if (urlIncludes.length > 0 && !urlIncludes.some((p) => url.includes(p))) {
    return false;
  }

  return true;
}

async function getSitemapUrls(startUrl, options = {}) {
  const visitedSitemaps = new Set();
  const finalUrls = new Set();

  // use exact incoming URL only
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
  const checkedLinks = new Set();
  const visitedPages = new Set();

  let queue = [];
  let checked = 0;

  const baseHost = new URL(startUrl).host;

  if (options?.sitemap) {
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

    updateScan(scanId, {
      checked,
      currentPage: page,
    });

    broadcastToScan(scanId, {
      type: "progress",
      checked,
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

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");

      if (!href || href.startsWith("#")) return;

      try {
        links.push(new URL(href, page).href);
      } catch {}
    });

    await Promise.all(
      links.map((link) =>
        limit(async () => {
          if (!checkedLinks.has(link)) {
            checkedLinks.add(link);

            try {
              const res = await axios.head(link, {
                timeout: 8000,
                validateStatus: () => true,
              });

              checked++;

              updateScan(scanId, {
                checked,
              });

              if (res.status >= 400) {
                const broken = {
                  url: link,
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
              checked++;

              updateScan(scanId, {
                checked,
              });

              const broken = {
                url: link,
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
