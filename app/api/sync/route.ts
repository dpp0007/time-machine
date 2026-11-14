import { denied, isAdmin } from "@/lib/auth";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

/** POST|GET /api/sync (admin) -> Monitor "run now" for every page. */
async function run(req: Request) {
  if (!isAdmin(req)) return denied();
  return Response.json({ results: await syncAll() });
}
export const POST = run;
export const GET = run;
