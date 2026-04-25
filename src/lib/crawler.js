import axios from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { broadcast } from "./ws.js";
import { crawlerControl } from "./controller.js";

const limit = pLimit(100);

// 🎯 filter helper
function shouldVisit(url, options) {
  if (!options) return true;

  const {
    urlStartsWith = [],
    urlNotStartsWith = [],
    urlIncludes = [],
    urlExclude = [],
  } = options;

  // ❌ reject if starts with excluded prefixes
  if (urlNotStartsWith.some((p) => url.startsWith(p))) {
    return false;
  }

  // ❌ reject if includes excluded text
  if (urlExclude.some((p) => url.includes(p))) {
    return false;
  }

  // ✅ allow only matching startsWith
  if (
    urlStartsWith.length > 0 &&
    !urlStartsWith.some((p) => url.startsWith(p))
  ) {
    return false;
  }

  // ✅ allow only matching includes
  if (urlIncludes.length > 0 && !urlIncludes.some((p) => url.includes(p))) {
    return false;
  }

  return true;
}

export async function runCrawler(startUrl, options = {}) {
  const visitedPages = new Set();
  const checkedLinks = new Set();
  const queue = [startUrl];

  const baseHost = new URL(startUrl).host;

  let checked = 0;

  while (queue.length) {
    // 🛑 stop
    if (crawlerControl.stopped) break;

    // ⏸ pause
    while (crawlerControl.paused) {
      await new Promise((r) => setTimeout(r, 500));
    }

    const page = queue.shift();

    if (visitedPages.has(page)) continue;
    if (!shouldVisit(page, options)) continue;

    visitedPages.add(page);

    broadcast({
      type: "progress",
      checked,
      currentPage: page,
    });

    let html = "";
    try {
      const res = await axios.get(page);
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
                validateStatus: () => true,
              });

              checked++;

              if (res.status >= 400) {
                broadcast({
                  type: "broken",
                  data: { url: link, status: res.status, source: page },
                });
              }
            } catch {
              checked++;

              broadcast({
                type: "broken",
                data: { url: link, status: "ERROR", source: page },
              });
            }
          }

          try {
            const host = new URL(link).host;

            if (host === baseHost && !visitedPages.has(link)) {
              if (shouldVisit(link, options)) {
                queue.push(link);
              }
            }
          } catch {}
        }),
      ),
    );
  }

  broadcast({ type: "done" });
}
