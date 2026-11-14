import { diffText } from "@/lib/diff";
import { getPage, resolve } from "@/lib/store";

/** GET /api/pages/:id/diff?from=2026-11-01&to=2026-11-14 (dates or version numbers) -> structured diff. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await getPage((await params).id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const a = resolve(p, q.get("from")), b = resolve(p, q.get("to") ?? new Date().toISOString());
  if (!a || !b) return Response.json({ error: "from/to must be version numbers or dates with a captured version", firstCapturedAt: p.versions[0]?.capturedAt ?? null }, { status: 404 });
  const brief = (v: typeof a) => ({ version: v.n, capturedAt: v.capturedAt, screenshot: v.shot });
  return Response.json({ page: p.name, source: p.url, from: brief(a), to: brief(b), ...diffText(a.text, b.text) });
}
