import { runCrawler } from "@/lib/crawler";
import { createScan } from "@/lib/scanStore";

export async function POST(req) {
  let body;

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, options = {}, scanId } = body;

  if (!url || !scanId) {
    return Response.json({ error: "url + scanId required" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return Response.json(
        { error: "URL must use http:// or https://" },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    createScan(scanId, url, options);
    runCrawler(url, scanId, options);

    return Response.json({ started: true, scanId });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
