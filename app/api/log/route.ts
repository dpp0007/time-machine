import { listPages } from "@/lib/store";

/** GET /api/log?result=changed&limit=500 -> chronological log of every Monitor run we ingested (proof of live operation). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const only = q.get("result"), limit = Number(q.get("limit") ?? 500);
  const log = (await listPages())
    .flatMap((p) => p.log.map((e) => ({ ...e, pageId: p.id, page: p.name, monitorId: p.monitorId, source_url: p.url })))
    .filter((e) => !only || e.result === only)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
  return Response.json({ count: log.length, log });
}
