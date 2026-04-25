import { runCrawler } from "@/lib/crawler";
import { createScan } from "@/lib/scanStore";

export async function POST(req) {
  try {
    const { url, options = {}, scanId } = await req.json();

    if (!url || !scanId) {
      return Response.json({ error: "url + scanId required" }, { status: 400 });
    }

    createScan(scanId, url, options);

    runCrawler(url, scanId, options);

    return Response.json({
      started: true,
      scanId,
    });
  } catch (err) {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
