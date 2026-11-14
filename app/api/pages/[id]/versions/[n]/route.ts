import { diffText } from "@/lib/diff";
import { getPage } from "@/lib/store";

/** GET /api/pages/:id/versions/:n -> one version in full, plus its diff against the previous version. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const p = await getPage(id);
  const v = p?.versions[Number(n) - 1];
  if (!p || !v) return Response.json({ error: "not found" }, { status: 404 });
  const prev = p.versions[Number(n) - 2];
  return Response.json({ ...v, source: p.url, diffFromPrevious: prev ? diffText(prev.text, v.text) : null });
}
