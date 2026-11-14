import { denied, isAdmin } from "@/lib/auth";
import { reschedule } from "@/lib/sync";

export const maxDuration = 300;

/** POST /api/admin/schedule (admin) -> apply SCHEDULE_CRON to every TinyFish Monitor. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return denied();
  return Response.json(await reschedule());
}
