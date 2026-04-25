import { getScan } from "@/lib/scanStore";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const scanId = searchParams.get("scanId");

  if (!scanId) {
    return Response.json({ error: "scanId required" }, { status: 400 });
  }

  return Response.json(getScan(scanId) || null);
}
