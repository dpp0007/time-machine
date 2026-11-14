import { listPages } from "@/lib/store";

/** GET /api/changes?limit=50 -> live change feed across every page (baselines excluded). */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const changes = (await listPages()).flatMap((p) =>
    p.versions.filter((v) => !v.baseline).map((v) => ({
      pageId: p.id, page: p.name, category: p.category, source: p.url, version: v.n, capturedAt: v.capturedAt,
      screenshot: v.shot, summary: v.summary, judgment: v.tf.judgment ?? null,
    })));
  changes.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return Response.json({ changes: changes.slice(0, limit) });
}
