import { denied, isAdmin } from "@/lib/auth";
import { prune } from "@/lib/sync";

/** POST /api/admin/prune (admin) -> retract versions that are noise-only under the current filter. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return denied();
  return Response.json({ pruned: await prune() });
}
