import { runCrawler } from "@/lib/crawler";
import { crawlerControl } from "@/lib/controller";

export async function POST(req) {
  try {
    const { url, options } = await req.json();

    if (!url) {
      return Response.json({ error: "URL required" }, { status: 400 });
    }

    // reset control
    crawlerControl.paused = false;
    crawlerControl.stopped = false;

    runCrawler(url, options);

    return Response.json({ started: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
