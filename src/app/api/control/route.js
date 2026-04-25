import { getScan } from "@/lib/scanStore";

export async function POST(req) {
  try {
    const { action, scanId } = await req.json();

    const scan = getScan(scanId);

    if (!scan) {
      return Response.json({ error: "scan not found" }, { status: 404 });
    }

    if (action === "pause") {
      scan.paused = true;
    }

    if (action === "resume") {
      scan.paused = false;
    }

    if (action === "stop") {
      scan.stopped = true;
      scan.paused = false;
    }

    if (action === "reset") {
      scan.checked = 0;
      scan.currentPage = "";
      scan.brokenLinks = [];
      scan.done = false;
      scan.loading = false;
      scan.paused = false;
      scan.stopped = false;
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
