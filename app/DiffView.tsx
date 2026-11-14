"use client";
import type { Diff } from "@/lib/diff";

export const ago = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export function rel(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** fetch for admin-only endpoints: asks for the token once per tab and retries. */
export async function adminFetch(url: string, init: RequestInit = {}) {
  const go = (t: string | null) => fetch(url, { ...init, headers: { ...init.headers, ...(t ? { "x-admin-token": t } : {}) } });
  let t: string | null = null;
  try { t = sessionStorage.getItem("tm-admin"); } catch {}
  let r = await go(t);
  if (r.status === 401) {
    t = window.prompt("Admin token required for this action:");
    if (!t) return r;
    r = await go(t);
    if (r.ok) try { sessionStorage.setItem("tm-admin", t); } catch {}
  }
  return r;
}

export function Chips({ s }: { s?: { added: number; removed: number; changed: number } }) {
  if (!s) return <span className="pill n">baseline</span>;
  return (<>
    {s.added > 0 && <span className="pill a">+{s.added} added</span>}{" "}
    {s.removed > 0 && <span className="pill r">−{s.removed} removed</span>}{" "}
    {s.changed > 0 && <span className="pill c">~{s.changed} changed</span>}
  </>);
}

export function Values({ v }: { v?: { from: string; to: string }[] }) {
  return <>{v?.slice(0, 4).map((x, i) => <span key={i} className="val"><s>{x.from}</s> → <i>{x.to}</i></span>)}</>;
}

export function DiffView({ d }: { d: Diff }) {
  if (!d.stats.added && !d.stats.removed && !d.stats.changed)
    return <p className="muted">No meaningful differences. Dates, ids and tracking noise are ignored.</p>;
  return (
    <div>
      {d.values.length > 0 && <><div className="lbl">Values that changed</div><Values v={d.values} /></>}
      {d.changed.length > 0 && <div className="lbl">Edited lines</div>}
      {d.changed.map((c, i) => (
        <div key={i} className="d c">
          {c.segments.map((s, k) => s.op === "eq" ? <span key={k}>{s.text}</span> : s.op === "add" ? <ins key={k}>{s.text}</ins> : <del key={k}>{s.text}</del>)}
        </div>
      ))}
      {d.added.length > 0 && <div className="lbl">Added</div>}
      {d.added.map((t, i) => <div key={"a" + i} className="d a">+ {t}</div>)}
      {d.removed.length > 0 && <div className="lbl">Removed</div>}
      {d.removed.map((t, i) => <div key={"r" + i} className="d r">− {t}</div>)}
    </div>
  );
}
