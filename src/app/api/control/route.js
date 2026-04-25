import { pauseCrawler, resumeCrawler, stopCrawler } from "@/lib/controller";

export async function POST(req) {
  const { action } = await req.json();

  if (action === "pause") pauseCrawler();
  if (action === "resume") resumeCrawler();
  if (action === "stop") stopCrawler();

  return Response.json({ ok: true });
}
