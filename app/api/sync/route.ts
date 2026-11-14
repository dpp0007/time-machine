import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

/** POST|GET /api/sync -> Monitor "run now" for every page (cron-friendly). */
async function run() { return Response.json({ results: await syncAll() }); }
export const POST = run;
export const GET = run;
