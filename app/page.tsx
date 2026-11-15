"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chips, Values, adminFetch, ago, clock, host, rel } from "./DiffView";

type Card = { id: string; name: string; url: string; category: string; versionCount: number; changes: number; checks: number; noiseIgnored: number; latestShot: string | null; lastCheckedAt: string | null; lastChangeAt: string | null; lastError: string | null };
type Sum = { added: number; removed: number; changed: number; values: { from: string; to: string }[] };
type Change = { pageId: string; page: string; category: string; version: number; capturedAt: string; screenshot: string | null; summary?: Sum };
type Log = { at: string; page: string; pageId: string; result: string; source: string; runId?: string; version?: number; detail?: string };
type Snap = { version: number | null; screenshot: string | null; capturedAt: string | null };

const DOCS: [string, string, string][] = [
  ["GET", "/api/pages", "All tracked pages with latest screenshot"],
  ["POST", "/api/pages", "Track any URL {url,name,category}: creates a TinyFish Page Monitor, stores baseline + screenshot"],
  ["GET", "/api/pages/:id", "Version timeline with screenshot + source link, plus the check log"],
  ["GET", "/api/pages/:id/asof?date=2026-11-10", "What the page said and looked like on a date"],
  ["GET", "/api/pages/:id/diff?from=…&to=…", "Structured diff (added / removed / changed / values) between dates or versions"],
  ["GET", "/api/pages/:id/versions/:n", "One full version and its diff vs the previous one"],
  ["POST", "/api/pages/:id/check", "Trigger Monitor run-now for one page"],
  ["GET", "/api/asof?date=…", "Every page as it was on a date, in one call"],
  ["GET", "/api/changes", "Change feed across all pages"],
  ["GET", "/api/log?result=changed", "Every Monitor run ingested (changed / unchanged / noise-ignored / error)"],
  ["GET", "/api/feed.xml", "Atom feed of changes"],
  ["GET", "/api/openapi", "OpenAPI 3 spec"],
  ["GET", "/api/export?text=1", "Full history as JSON"],
  ["POST", "/api/webhook/monitor?s=…", "Receiver for TinyFish Monitor scheduled-run webhooks"],
];

const pillFor = (r: string) => (r === "changed" ? "c" : r === "error" ? "r" : r === "baseline" || r === "pending" ? "n" : "a");

export default function Home() {
  const [pages, setPages] = useState<Card[] | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [tab, setTab] = useState<"pages" | "feed" | "log" | "api">("pages");
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [tdate, setTdate] = useState("");
  const [snap, setSnap] = useState<Record<string, Snap>>({});
  const [busy, setBusy] = useState("");
  const [prog, setProg] = useState<{ done: number; total: number; fails: string[] } | null>(null);
  const [form, setForm] = useState({ url: "", name: "", category: "" });
  const [msg, setMsg] = useState<{ t: string; k: string } | null>(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([fetch("/api/pages").then((r) => r.json()), fetch("/api/changes").then((r) => r.json()), fetch("/api/log?limit=300").then((r) => r.json())]);
    setPages(a.pages); setChanges(b.changes); setLog(c.log);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!tdate) { setSnap({}); return; }
    fetch("/api/asof?date=" + tdate).then((r) => r.json()).then((j) => setSnap(Object.fromEntries(j.pages.map((p: { id: string }) => [p.id, p]))));
  }, [tdate, pages?.length]);

  const add = async (body: object) => {
    const r = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy("add"); setMsg({ t: "Creating a TinyFish Monitor, fetching the baseline and taking a screenshot (10–40s)…", k: "" });
    try { const j = await add(form); setMsg({ t: j.existed ? "Already tracked." : "Added. Baseline captured.", k: "ok" }); setForm({ url: "", name: "", category: "" }); await load(); }
    catch (e) { setMsg({ t: (e as Error).message, k: "bad" }); }
    setBusy("");
  };
  const seed = async () => {
    const list: { url: string; name: string; category: string }[] = (await fetch("/api/seed").then((r) => r.json())).pages;
    const todo = list.filter((s) => !pages?.some((p) => p.url === s.url));
    if (!todo.length) return setMsg({ t: "All seed pages are already tracked.", k: "ok" });
    setBusy("seed"); setProg({ done: 0, total: todo.length, fails: [] });
    let i = 0, done = 0; const fails: string[] = [];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (i < todo.length) {
        const s = todo[i++];
        try { await add(s); } catch (e) { fails.push(`${s.name}: ${(e as Error).message.slice(0, 90)}`); }
        setProg({ done: ++done, total: todo.length, fails: [...fails] });
        load();
      }
    }));
    setBusy("");
  };
  const syncAll = async () => {
    setBusy("sync"); setMsg({ t: "Running every Monitor now…", k: "" });
    const r = await adminFetch("/api/sync", { method: "POST" });
    if (!r.ok) { setMsg({ t: "Not allowed (admin token needed).", k: "bad" }); setBusy(""); return; }
    const j = await r.json();
    const n = j.results.filter((x: { changed?: boolean }) => x.changed).length;
    setMsg({ t: `Checked ${j.results.length} pages at ${clock(new Date().toISOString())}: ${n ? n + " changed" : "no changes"}.`, k: n ? "warn" : "ok" });
    await load(); setBusy("");
  };

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    (pages ?? []).forEach((p) => m.set(p.category, (m.get(p.category) ?? 0) + 1));
    return Array.from(m.entries()).sort();
  }, [pages]);
  const shown = (pages ?? [])
    .filter((p) => (cat === "All" || p.category === cat) && (p.name + p.url).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.lastChangeAt ?? "").localeCompare(a.lastChangeAt ?? "") || a.name.localeCompare(b.name));
  const sum = (f: (p: Card) => number) => (pages ?? []).reduce((a, p) => a + f(p), 0);
  const lastRun = log[0]?.at ?? null;

  return (<>
    <div className="hero">
      <div>
        <h1>Every change to the pages that matter, with the receipts.</h1>
        <p className="muted">TinyFish Monitor checks each page on a schedule. When the content really changes (not just a date or tracking code) we store a screenshot and a structured diff.</p>
      </div>
      <div className="stats">
        <div className="stat"><b>{pages?.length ?? "–"}</b><span>pages watched</span></div>
        <div className="stat"><b>{sum((p) => p.checks)}</b><span>Monitor runs</span></div>
        <div className="stat hl"><b>{sum((p) => p.changes)}</b><span>real changes caught</span></div>
        <div className="stat"><b>{sum((p) => p.noiseIgnored)}</b><span>noise &amp; flips ignored</span></div>
        <div className="stat"><b>{lastRun ? rel(lastRun) : "–"}</b><span>last run</span></div>
      </div>
    </div>

    <div className="tabs" style={{ marginBottom: 18, width: "fit-content" }}>
      {([["pages", "Pages"], ["feed", `Changes (${changes.length})`], ["log", "Monitor log"], ["api", "API"]] as const).map(([t, l]) =>
        <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{l}</button>)}
    </div>

    <div className="dash">
      <aside className="side">
        <form className="panel" onSubmit={submit}>
          <h2>Track a page</h2>
          <input required type="url" placeholder="https://example.com/pricing" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <label className="f">Name</label>
          <input placeholder="Optional" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="f">Category</label>
          <input list="cats" placeholder="e.g. SaaS pricing" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="cats">{cats.map(([c]) => <option key={c} value={c} />)}</datalist>
          <button className="pri" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} disabled={!!busy}>{busy === "add" ? "Adding…" : "Start tracking"}</button>
        </form>

        <div className="panel">
          <h2>Categories</h2>
          <div className="cats">
            <button className={cat === "All" ? "on" : ""} onClick={() => setCat("All")}><span>All pages</span><span>{pages?.length ?? 0}</span></button>
            {cats.map(([c, n]) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}><span>{c}</span><span>{n}</span></button>)}
          </div>
        </div>

        <div className="panel">
          <h2>Time travel</h2>
          <p className="muted sm" style={{ margin: "0 0 8px" }}>See every page as it was on a date.</p>
          <input type="date" value={tdate} onChange={(e) => { setTdate(e.target.value); setTab("pages"); }} />
          {tdate && <button className="ghost" style={{ marginTop: 8 }} onClick={() => setTdate("")}>Back to now</button>}
        </div>

        <div className="panel">
          <h2>Tools</h2>
          <div className="row2">
            <button onClick={syncAll} disabled={!!busy}>{busy === "sync" ? "Checking…" : "Check all now"}</button>
            <a className="btn" href="/api/export?text=1" download>Export JSON</a>
            <button onClick={seed} disabled={!!busy}>{busy === "seed" ? "Seeding…" : "Add seed pages"}</button>
          </div>
          {prog && <div className="prog"><i style={{ width: `${(prog.done / Math.max(prog.total, 1)) * 100}%` }} /></div>}
          {prog?.fails.length ? <details style={{ marginTop: 8 }}><summary className="sm" style={{ color: "var(--bad)" }}>{prog.fails.length} failed</summary>{prog.fails.map((f) => <div key={f} className="muted sm">{f}</div>)}</details> : null}
          {msg && <div className={"toast " + msg.k}>{msg.t}</div>}
        </div>
      </aside>

      <section>
        {tab === "pages" && <>
          <div className="row2" style={{ marginBottom: 12 }}>
            <input placeholder="Search pages…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
            <span className="muted sm">{tdate ? `Showing the web as of ${tdate}` : `${shown.length} of ${pages?.length ?? 0} pages, most recently changed first`}</span>
          </div>
          {pages && !pages.length && <div className="empty"><h3>No pages yet</h3>Track a URL on the left, or add the seed pages.</div>}
          <div className="rows">
            {shown.map((p) => {
              const s = tdate ? snap[p.id] : null;
              const shot = tdate ? s?.screenshot : p.latestShot;
              const missing = !!tdate && !!s && !s.version;
              return (
                <Link key={p.id} href={s?.version ? `/p/${p.id}?v=${s.version}` : `/p/${p.id}`} className="row" style={missing ? { opacity: 0.45 } : {}}>
                  <div className="th" style={shot ? { backgroundImage: `url(${shot})` } : {}}>{!shot && (missing ? "not tracked yet" : "no screenshot")}</div>
                  <div style={{ minWidth: 0 }}>
                    <h3>{p.name}</h3>
                    <div className="muted sm">{p.category} · {host(p.url)}</div>
                    <div className="status">
                      {p.lastError ? <><span className="dot bad" /><span style={{ color: "var(--bad)" }}>Check failed: {p.lastError}</span></>
                        : p.changes ? <><span className="dot warn" /><span>Changed {rel(p.lastChangeAt)}</span><span className="faint">· checked {rel(p.lastCheckedAt)}</span></>
                        : <><span className="dot" /><span>No change yet</span><span className="faint">· {Math.max(p.checks - 1, 0)} re-check{p.checks === 2 ? "" : "s"}, last {rel(p.lastCheckedAt)}</span></>}
                    </div>
                  </div>
                  <div className="vcount"><b>{tdate && s?.version ? `v${s.version}` : p.versionCount}</b><span>{tdate ? "on date" : p.versionCount === 1 ? "version" : "versions"}</span></div>
                </Link>
              );
            })}
          </div>
        </>}

        {tab === "feed" && (changes.length ? <div className="rows">{changes.map((c) => (
          <Link key={c.pageId + c.version} href={`/p/${c.pageId}?v=${c.version}`} className="row">
            <div className="th" style={c.screenshot ? { backgroundImage: `url(${c.screenshot})` } : {}} />
            <div><h3>{c.page}</h3><div className="muted sm">{c.category} · v{c.version} · {ago(c.capturedAt)}</div><div style={{ marginTop: 6 }}><Chips s={c.summary} /> <Values v={c.summary?.values} /></div></div>
            <div className="vcount"><b>v{c.version}</b><span>{rel(c.capturedAt)}</span></div>
          </Link>))}</div>
          : <div className="empty"><h3>No changes caught yet</h3>Baselines are stored for every page. The first real change will appear here with its screenshot.<br />Hourly checks keep running, and each one is listed in the Monitor log.</div>)}

        {tab === "log" && <div className="panel">
          <h2>Every TinyFish Monitor run we ingested <a className="btn" href="/api/log?limit=5000" target="_blank">JSON</a></h2>
          <div style={{ overflowX: "auto" }}><table><thead><tr><th>Time</th><th>Page</th><th>Result</th><th>Via</th><th>Run</th></tr></thead><tbody>
            {log.map((e, i) => <tr key={i}><td className="sm">{ago(e.at)}</td><td><Link className="link" href={`/p/${e.pageId}${e.version ? "?v=" + e.version : ""}`}>{e.page}</Link></td>
              <td><span className={"pill " + pillFor(e.result)}>{e.result}</span> <span className="muted sm">{e.detail}</span></td><td className="sm">{e.source}</td><td><code>{e.runId?.slice(0, 8)}</code></td></tr>)}
          </tbody></table></div>{!log.length && <p className="muted">No runs yet.</p>}
        </div>}

        {tab === "api" && <div className="panel">
          <h2>Time Machine API</h2>
          <p className="muted sm">JSON everywhere. Dates accept <code>YYYY-MM-DD</code> or ISO; <code>from</code>/<code>to</code> also accept version numbers. Spec: <a className="link" href="/api/openapi">/api/openapi</a></p>
          <div style={{ overflowX: "auto" }}><table><tbody>{DOCS.map(([m, p, d]) => <tr key={m + p}><td><code>{m}</code></td><td><code>{p}</code></td><td className="muted">{d}</td></tr>)}</tbody></table></div>
        </div>}
      </section>

      <aside className="activity side">
        <div className="panel">
          <h2>Live activity</h2>
          <div className="feed">
            {log.slice(0, 12).map((e, i) => (
              <Link key={i} href={`/p/${e.pageId}`}>
                <div><span className={"pill " + pillFor(e.result)}>{e.result === "unchanged" ? "no change" : e.result}</span> <span className="faint">{rel(e.at)}</span></div>
                <div style={{ marginTop: 3 }}>{e.page}</div>
              </Link>
            ))}
            {!log.length && <p className="muted sm">Waiting for the first runs…</p>}
          </div>
        </div>
      </aside>
    </div>
  </>);
}
