import { checkPage } from "@/lib/sync";

export const maxDuration = 300;

/** POST /api/pages/:id/check -> TinyFish Monitor "run now"; records a version if the page really changed. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await checkPage((await params).id)); }
  catch (e) { const m = (e as Error).message; return Response.json({ error: m }, { status: m.startsWith("cooldown") ? 429 : 502 }); }
}
