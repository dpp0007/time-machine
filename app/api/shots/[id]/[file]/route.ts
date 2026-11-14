import { getShot } from "@/lib/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  if (!/^\w+$/.test(id) || !/^\d+\.jpg$/.test(file)) return new Response("bad", { status: 400 });
  const img = await getShot(id, parseInt(file));
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
