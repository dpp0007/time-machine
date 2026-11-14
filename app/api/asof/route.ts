import { asOf, listPages } from "@/lib/store";

/** GET /api/asof?date=2026-11-10 -> every tracked page as it was on that date (one call, whole web-history snapshot). */
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return Response.json({ error: "date required" }, { status: 400 });
  const pages = (await listPages()).map((p) => {
    const v = asOf(p, date);
    return { id: p.id, name: p.name, category: p.category, source: p.url, version: v?.n ?? null, capturedAt: v?.capturedAt ?? null, screenshot: v?.shot ?? null };
  });
  return Response.json({ date, pages });
}
