import { listPages } from "@/lib/store";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** GET /api/feed.xml -> Atom feed of every caught change; subscribe from any reader or automation. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const items = (await listPages())
    .flatMap((p) => p.versions.filter((v) => !v.baseline).map((v) => ({ p, v })))
    .sort((a, b) => b.v.capturedAt.localeCompare(a.v.capturedAt)).slice(0, 100);
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Time Machine changes</title><id>${origin}/api/feed.xml</id><updated>${items[0]?.v.capturedAt ?? new Date().toISOString()}</updated>${items.map(({ p, v }) =>
    `<entry><title>${esc(p.name)} changed (v${v.n})</title><id>${origin}/p/${p.id}?v=${v.n}</id><link href="${origin}/p/${p.id}?v=${v.n}"/><updated>${v.capturedAt}</updated><summary>${esc(v.summary ? `+${v.summary.added} added, -${v.summary.removed} removed, ~${v.summary.changed} changed. ` + v.summary.values.map((x) => `${x.from} -> ${x.to}`).join(", ") : "")}</summary></entry>`).join("")}</feed>`;
  return new Response(xml, { headers: { "content-type": "application/atom+xml" } });
}
