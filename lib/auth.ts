/** Destructive/costly endpoints need ADMIN_TOKEN (header x-admin-token or ?token=). Unset = open (local dev). */
export function isAdmin(req: Request) {
  const t = process.env.ADMIN_TOKEN;
  if (!t) return true;
  return req.headers.get("x-admin-token") === t || new URL(req.url).searchParams.get("token") === t;
}
export const denied = () => Response.json({ error: "admin token required" }, { status: 401 });
