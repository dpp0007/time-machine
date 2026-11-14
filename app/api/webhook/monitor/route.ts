import { listPages } from "@/lib/store";
import { ingest } from "@/lib/sync";
import type { MonitorRun } from "@/lib/tf";

/** POST /api/webhook/monitor?s=SECRET <- TinyFish Page Monitor posts every scheduled run here. */
export async function POST(req: Request) {
  if (new URL(req.url).searchParams.get("s") !== (process.env.WEBHOOK_SECRET || ""))
    return Response.json({ error: "bad secret" }, { status: 401 });
  const run = (await req.json()) as MonitorRun & { fetch_monitor_id?: string };
  const page = (await listPages()).find((p) => p.monitorId === run.fetch_monitor_id);
  if (!page) return Response.json({ ignored: true });
  return Response.json(await ingest(page.id, run, "webhook"));
}
