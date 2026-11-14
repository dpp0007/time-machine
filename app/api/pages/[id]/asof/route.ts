import { asOf, getPage } from "@/lib/store";

/** GET /api/pages/:id/asof?date=2026-11-10 -> what the page said and looked like on that date. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await getPage((await params).id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return Response.json({ error: "date required (YYYY-MM-DD or ISO)" }, { status: 400 });
  const v = asOf(p, date);
  if (!v) return Response.json({ error: "no version at that date", firstCapturedAt: p.versions[0]?.capturedAt ?? null }, { status: 404 });
  return Response.json({ page: p.name, source: p.url, asOf: date, version: v.n, capturedAt: v.capturedAt, validUntil: p.versions[v.n]?.capturedAt ?? null, title: v.title, screenshot: v.shot, text: v.text });
}
