import { addPage } from "@/lib/sync";
import { card, listPages } from "@/lib/store";

export const maxDuration = 300;

/** GET /api/pages -> every tracked page with its latest screenshot and change count. */
export async function GET() {
  return Response.json({ pages: (await listPages()).map(card).sort((a, b) => a.name.localeCompare(b.name)) });
}

/** POST /api/pages {url, name?, category?} -> creates a TinyFish Page Monitor, stores baseline + screenshot. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    const u = new URL(b.url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("only http(s) urls");
    return Response.json(await addPage(u.href, b.name || u.hostname + u.pathname, b.category));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
