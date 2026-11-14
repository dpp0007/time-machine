import { listPages } from "@/lib/store";

/** GET /api/export[?text=1] -> the full version history of every page as JSON, for other tools. */
export async function GET(req: Request) {
  const withText = new URL(req.url).searchParams.has("text");
  const pages = (await listPages()).map((p) => ({
    id: p.id, name: p.name, url: p.url, category: p.category, monitorId: p.monitorId, createdAt: p.createdAt,
    versions: p.versions.map((v) => ({ ...v, text: withText ? v.text : undefined })),
  }));
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), pages }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="time-machine-export.json"' },
  });
}
