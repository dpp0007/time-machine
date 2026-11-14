"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chips, ago } from "./DiffView";

type Log = { at: string; page: string; pageId: string; result: string; source: string; runId?: string; version?: number; detail?: string };
type Card = { noiseIgnored: number; checks: number; id: string; name: string; url: string; category: string; versionCount: number; changes: number; latestShot: string | null; lastCheckedAt: string | null; lastChangeAt: string | null; lastError: string | null };
type Change = { pageId: string; page: string; category: string; version: number; capturedAt: string; screenshot: string | null; summary?: { added: number; removed: number; changed: number; values: { from: string; to: string }[] } };

const DOCS: [string, string, string][] = [
  ["GET", "/api/pages", "All tracked pages + latest screenshot"],
  ["POST", "/api/pages", "Add any URL {url,name,category}: creates a TinyFish Page Monitor, stores baseline + screenshot"],
  ["GET", "/api/pages/:id", "Version timeline: every version with screenshot + source link"],
  ["GET", "/api/pages/:id/asof?date=2026-11-10", "What the page said and looked like on a date"],
  ["GET", "/api/pages/:id/diff?from=…&to=…", "Structured diff (added / removed / changed / price values) between two dates or versions"],
  ["GET", "/api/pages/:id/versions/:n", "One full version + diff vs previous"],
  ["POST", "/api/pages/:id/check", "Trigger Monitor run-now for one page"],
  ["GET", "/api/asof?date=…", "Every page as it was on a date, in one call"],
  ["GET", "/api/changes", "Live change feed across all pages"],
  ["GET", "/api/log?result=changed", "Log of every Monitor run ingested (changed / unchanged / noise-ignored / error)"],
  ["GET", "/api/feed.xml", "Atom feed of changes"],
  ["GET", "/api/openapi", "OpenAPI 3 spec"],
  ["GET", "/api/export?text=1", "Full history as JSON for other tools"],
  ["POST", "/api/webhook/monitor?s=…", "Receiver for TinyFish Monitor scheduled-run webhooks"],
];

export default function Home() {
  const [pages, setPages] = useState<Card[] | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [tab, setTab] = useState<"pages" | "feed" | "log" | "api">("pages");
  const [log, setLog] = useState<Log[]>([]);
  const [tdate, setTdate] = useState("");
  const [snap, setSnap] = useState<Record<string, { version: number | null; screenshot: string | null; capturedAt: string | null }>>({});
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [prog, setProg] = useState<{ done: number; total: number; fails: string[] } | null>(null);
  const [form, setForm] = useState({ url: "", name: "", category: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([fetch("/api/pages").then((r) => r.json()), fetch("/api/changes").then((r) => r.json()), fetch("/api/log?limit=300").then((r) => r.json())]);
    setPages(a.pages); setChanges(b.changes); setLog(c.log);
  }, []);
  useEffect(() => {
    if (!tdate) return setSnap({});
    fetch("/api/asof?date=" + tdate).then((r) => r.json()).then((j) => setSnap(Object.fromEntries(j.pages.map((p: { id: string }) => [p.id, p]))));
  }, [tdate, pages?.length]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const add = async (body: object) => {
    const r = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy("add"); setMsg("Creating TinyFish Monitor, fetching baseline and taking a screenshot (10–40s)…");
    try { const j = await add(form); setMsg(j.existed ? "Already tracked." : "Added ✓"); setForm({ url: "", name: "", category: "" }); await load(); }
    catch (e) { setMsg("Error: " + (e as Error).message); }
    setBusy("");
  };
  const seed = async () => {
    const list: { url: string; name: string; category: string }[] = (await fetch("/api/seed").then((r) => r.json())).pages;
    const todo = list.filter((s) => !pages?.some((p) => p.url === s.url));
    setBusy("seed"); setProg({ done: 0, total: todo.length, fails: [] });
    let i = 0, done = 0; const fails: string[] = [];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (i < todo.length) {
        const s = todo[i++];
        try { await add(s); } catch (e) { fails.push(`${s.name}: ${(e as Error).message.slice(0, 80)}`); }
        setProg({ done: ++done, total: todo.length, fails: [...fails] });
        load();
      }
    }));
    setBusy("");
  };
  const syncAll = async () => {
    setBusy("sync"); setMsg("Running every Monitor now…");
    const j = await fetch("/api/sync", { method: "POST" }).then((r) => r.json());
    const n = j.results.filter((x: { changed?: boolean }) => x.changed).length;
    setMsg(`Checked ${j.results.length} pages — ${n} changed.`); await load(); setBusy("");
  };

  const cats = useMemo(() => ["All", ...Array.from(new Set((pages ?? []).map((p) => p.category))).sort()], [pages]);
  const shown = (pages ?? []).filter((p) => (cat === "All" || p.category === cat) && (p.name + p.url).toLowerCase().includes(q.toLowerCase()));
  const totalVersions = (pages ?? []).reduce((a, p) => a + p.versionCount, 0);
  const totalChanges = (pages ?? []).reduce((a, p) => a + p.changes, 0);

  return (<>
    <div className="stats">
      <div className="stat"><b>{pages?.length ?? "–"}</b><span className="muted">pages watched</span></div>
      <div className="stat"><b>{totalVersions}</b><span className="muted">versions stored</span></div>
      <div className="stat"><b>{totalChanges}</b><span className="muted">real changes caught</span></div>
      <div className="stat"><b>{(pages ?? []).reduce((a, p) => a + p.checks, 0)}</b><span className="muted">Monitor runs ingested</span></div>
      <div className="stat"><b>{(pages ?? []).reduce((a, p) => a + p.noiseIgnored, 0)}</b><span className="muted">noise-only edits ignored</span></div>
      <div className="stat"><b>{pages?.filter((p) => p.lastError).length ?? 0}</b><span className="muted">pages with errors</span></div>
    </div>

    <form className="panel row" onSubmit={submit}>
      <input style={{ flex: "2 1 260px" }} required type="url" placeholder="Paste any page URL to start its history…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
      <input style={{ flex: "1 1 140px" }} placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input style={{ flex: "1 1 140px" }} list="cats" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      <datalist id="cats">{cats.filter((c) => c !== "All").map((c) => <option key={c} value={c} />)}</datalist>
      <button className="pri" disabled={!!busy}>{busy === "add" ? "Adding…" : "Track page"}</button>
    </form>

    <div className="bar">
      <button onClick={seed} disabled={!!busy}>{busy === "seed" ? "Seeding…" : "Seed 30 real pages"}</button>
      <button onClick={syncAll} disabled={!!busy}>{busy === "sync" ? "Checking…" : "Check all now"}</button>
      <a className="btn" href="/api/export?text=1" download>Export JSON</a>
      {prog && <><div className="prog"><i style={{ width: `${(prog.done / Math.max(prog.total, 1)) * 100}%` }} /></div><span className="muted">{prog.done}/{prog.total}</span></>}
      <span className="muted grow">{msg}</span>
    </div>
    {prog?.fails.length ? <details className="panel"><summary className="err">{prog.fails.length} pages failed to add</summary>{prog.fails.map((f) => <div key={f} className="muted">{f}</div>)}</details> : null}

    <div className="tabs">
      {(["pages", "feed", "log", "api"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "pages" ? "Pages" : t === "feed" ? `Change feed (${changes.length})` : t === "log" ? "Monitor log" : "API"}</button>)}
    </div>

    {tab === "pages" && <>
      <div className="bar"><input placeholder="Search pages…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="muted">⏪ Show the whole web as of <input type="date" value={tdate} onChange={(e) => setTdate(e.target.value)} /></label>
        {tdate && <button onClick={() => setTdate("")}>Back to now</button>}</div>
      <div className="chips">{cats.map((c) => <button key={c} className={"chip " + (cat === c ? "on" : "")} onClick={() => setCat(c)}>{c}</button>)}</div>
      {pages && !pages.length && <div className="empty"><h3>No pages yet</h3>Paste a URL above or seed 30 real pricing, policy, visa, insurance and menu pages.</div>}
      <div className="grid">
        {shown.map((p) => (
          <Link key={p.id} href={tdate && snap[p.id]?.version ? `/p/${p.id}?v=${snap[p.id].version}` : `/p/${p.id}`} className="card" style={tdate && snap[p.id] && !snap[p.id].version ? { opacity: 0.4 } : {}}>
            <div className="thumb" style={(tdate ? snap[p.id]?.screenshot : p.latestShot) ? { backgroundImage: `url(${tdate ? snap[p.id]?.screenshot : p.latestShot})` } : {}}>
              {!(tdate ? snap[p.id]?.screenshot : p.latestShot) && (tdate && snap[p.id] && !snap[p.id].version ? "not tracked yet on this date" : "no screenshot")}
              <span className={"badge " + (p.changes ? "" : "zero")}>{tdate && snap[p.id]?.version ? `v${snap[p.id].version} on ${tdate}` : `${p.changes} change${p.changes === 1 ? "" : "s"}`}</span>
            </div>
            <div className="body">
              <h3>{p.name}</h3>
              <div className="muted">{p.category} · {p.versionCount} version{p.versionCount === 1 ? "" : "s"}</div>
              <div className="muted">{p.lastChangeAt ? "changed " + ago(p.lastChangeAt) : "no change yet"}</div>
              {p.lastError && <div className="err">last check failed: {p.lastError}</div>}
            </div>
          </Link>
        ))}
      </div>
    </>}

    {tab === "feed" && (changes.length ? changes.map((c) => (
      <Link key={c.pageId + c.version} href={`/p/${c.pageId}?v=${c.version}`} className="card" style={{ display: "grid", gridTemplateColumns: "120px 1fr", marginBottom: 10 }}>
        <div className="thumb" style={{ height: 80, ...(c.screenshot ? { backgroundImage: `url(${c.screenshot})` } : {}) }} />
        <div className="body"><b>{c.page}</b> <span className="muted">· {c.category} · v{c.version} · {ago(c.capturedAt)}</span><div><Chips s={c.summary} /> {c.summary?.values.slice(0, 4).map((v, i) => <span key={i} className="val"><s>{v.from}</s> → <i>{v.to}</i></span>)}</div></div>
      </Link>
    )) : <div className="empty">No changes caught yet. Baselines are stored; the first real change will show up here with its screenshot.</div>)}

    {tab === "log" && <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}><h2>Every TinyFish Monitor run we ingested</h2><a className="btn" href="/api/log?limit=5000" target="_blank">JSON</a></div>
      <table><thead><tr><th>Time</th><th>Page</th><th>Result</th><th>Via</th><th>Run id</th><th></th></tr></thead><tbody>
        {log.map((e, i) => <tr key={i}><td>{ago(e.at)}</td><td><Link href={`/p/${e.pageId}${e.version ? "?v=" + e.version : ""}`}>{e.page}</Link></td>
          <td><span className={"pill " + (e.result === "changed" ? "a" : e.result === "error" ? "r" : "c")}>{e.result}</span> {e.detail}</td><td>{e.source}</td><td><code>{e.runId?.slice(0, 8)}</code></td><td /></tr>)}
      </tbody></table>{!log.length && <p className="muted">No runs yet.</p>}
    </div>}

    {tab === "api" && <div className="panel">
      <h2>Time Machine API</h2>
      <p className="muted">Every endpoint returns JSON. Dates accept <code>YYYY-MM-DD</code> or ISO timestamps; <code>from</code>/<code>to</code> also accept version numbers.</p>
      <table><tbody>{DOCS.map(([m, p, d]) => <tr key={m + p}><td><code>{m}</code></td><td><code>{p}</code></td><td>{d}</td></tr>)}</tbody></table>
    </div>}
  </>);
}
