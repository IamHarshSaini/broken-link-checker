import { getScan } from "@/lib/scanStore";

export async function POST(req) {
  try {
    const { action, scanId } = await req.json();

    const scan = getScan(scanId);

    if (!scan) {
      return Response.json({ error: "scan not found" }, { status: 404 });
    }

    // pause
    if (action === "pause") {
      scan.paused = true;
    }

    // resume
    if (action === "resume") {
      scan.paused = false;
    }

    // stop
    if (action === "stop") {
      scan.stopped = true;
      scan.paused = false;
      scan.loading = false;
    }

    // reset
    if (action === "reset") {
      scan.url = "";
      scan.checkedPages = 0;
      scan.checkedLinks = 0;
      scan.redirectedCount = 0;

      scan.options = {};

      scan.currentPage = "";
      scan.brokenLinks = [];

      scan.done = false;
      scan.loading = false;

      scan.paused = false;
      scan.stopped = false;

      scan.createdAt = Date.now();
      scan.finishedAt = null;
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);

    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
