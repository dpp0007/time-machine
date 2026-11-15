import { denied, isAdmin } from "@/lib/auth";
import { compact } from "@/lib/sync";

/** POST /api/admin/compact (admin) -> collapse flip-flop (A/B variant) history to its distinct states. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return denied();
  return Response.json({ compacted: await compact() });
}
