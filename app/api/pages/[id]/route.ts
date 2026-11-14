import { card, getPage, slim } from "@/lib/store";
import { removePage } from "@/lib/sync";
import { denied, isAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/pages/:id -> page + version timeline (newest first), each with screenshot and source link. */
export async function GET(_: Request, { params }: Ctx) {
  const p = await getPage((await params).id);
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ...card(p), source: p.url, log: [...p.log].reverse().slice(0, 200), versions: p.versions.map(slim).reverse() });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!isAdmin(req)) return denied();
  await removePage((await params).id);
  return Response.json({ deleted: true });
}
