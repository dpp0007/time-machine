export const dynamic = "force-dynamic";
/** GET /api/health -> cheap liveness check for uptime pingers (keeps a free Render service awake). */
export const GET = () => Response.json({ ok: true, at: new Date().toISOString() });
