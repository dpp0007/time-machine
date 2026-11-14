"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Diff } from "@/lib/diff";
import { Chips, DiffView, ago } from "../../DiffView";

type V = { n: number; capturedAt: string; title: string | null; shot: string | null; shotError?: string; baseline: boolean; chars: number; summary?: { added: number; removed: number; changed: number; values: { from: string; to: string }[] }; tf: { runId?: string; source: string; judgment?: { summary?: string; is_relevant?: boolean } | null } };
type P = { id: string; name: string; source: string; category: string; monitorId: string; schedule: string; lastCheckedAt: string | null; lastError: string | null; checks: number; versions: V[] };
type Full = { text: string; diffFromPrevious: Diff | null };

export default function PageDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<P | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [view, setView] = useState<"shot" | "diff" | "text">("shot");
  const [date, setDate] = useState("");
  const [asof, setAsof] = useState<{ version?: number; capturedAt?: string; validUntil?: string | null; error?: string; firstCapturedAt?: string } | null>(null);
  const [cmp, setCmp] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [cmpRes, setCmpRes] = useState<(Diff & { error?: string; from: { version: number }; to: { version: number } }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/pages/${id}`);
    if (!r.ok) return router.push("/");
    const j: P = await r.json();
    setP(j);
    setSel((s) => s ?? (Number(new URLSearchParams(location.search).get("v")) || j.versions[0]?.n || null));
  }, [id, router]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (sel == null) return;
    setFull(null);
    fetch(`/api/pages/${id}/versions/${sel}`).then((r) => r.json()).then(setFull);
  }, [sel, id]);

  const cur = p?.versions.find((v) => v.n === sel);
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const j = await fetch(`/api/pages/${id}/asof?date=${date}`).then((r) => r.json());
    setAsof(j);
    if (j.version) { setSel(j.version); setView("shot"); }
  };
  const compare = async (e: React.FormEvent) => {
    e.preventDefault();
    setCmpRes(await fetch(`/api/pages/${id}/diff?from=${cmp.from}&to=${cmp.to}`).then((r) => r.json()));
  };
  const check = async () => {
    setBusy(true); setMsg("Running TinyFish Monitor…");
    const j = await fetch(`/api/pages/${id}/check`, { method: "POST" }).then((r) => r.json());
    setMsg(j.error ? "Error: " + j.error : j.changed ? `Change caught → v${j.version}` : "No meaningful change.");
    await load(); setBusy(false);
  };
  const del = async () => {
    if (!confirm("Delete this page, its Monitor and all history?")) return;
    await fetch(`/api/pages/${id}`, { method: "DELETE" }); router.push("/");
  };

  if (!p) return <p className="muted">Loading…</p>;
  const vs = p.versions;
  return (<>
    <p><Link href="/">← All pages</Link></p>
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <h1 style={{ margin: 0 }}>{p.name}</h1>
        <div className="muted">{p.category} · <a href={p.source} target="_blank" rel="noreferrer">{p.source}</a> · Monitor <code>{p.monitorId.slice(0, 8)}</code> · <code>{p.schedule}</code> · {p.checks} checks{p.lastCheckedAt && ` · last ${ago(p.lastCheckedAt)}`}</div>
        {p.lastError && <div className="err">last check failed: {p.lastError}</div>}
      </div>
      <div className="row"><span className="muted">{msg}</span><button onClick={check} disabled={busy}>{busy ? "Checking…" : "Check now"}</button><a className="btn" href={`/api/pages/${id}`} target="_blank">JSON</a><button className="danger" onClick={del}>Delete</button></div>
    </div>

    <div className="layout">
      <aside>
        <form className="panel" onSubmit={lookup}>
          <h2>What did it say on…</h2>
          <div className="row"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /><button className="pri">Go</button></div>
          {asof && <p className={asof.error ? "err" : "muted"} style={{ margin: "8px 0 0" }}>
            {asof.error ? `${asof.error}${asof.firstCapturedAt ? ` — history starts ${ago(asof.firstCapturedAt)}` : ""}` : `Version ${asof.version}, captured ${ago(asof.capturedAt!)}${asof.validUntil ? `, replaced ${ago(asof.validUntil)}` : ", still current"}`}
          </p>}
        </form>
        <h3 style={{ margin: "4px 0 10px" }}>Timeline · {vs.length} version{vs.length === 1 ? "" : "s"}</h3>
        <div className="timeline">
          {vs.map((v) => (
            <button key={v.n} className={"tl " + (sel === v.n ? "on" : "")} onClick={() => { setSel(v.n); setView("shot"); }}>
              <div className="t" style={v.shot ? { backgroundImage: `url(${v.shot})` } : {}} />
              <div><b>v{v.n}</b> <span className="muted">{ago(v.capturedAt)}</span><div><Chips s={v.baseline ? undefined : v.summary} />{v.summary?.values.slice(0, 2).map((x, i) => <span key={i} className="val"><s>{x.from}</s>→<i>{x.to}</i></span>)}</div></div>
            </button>
          ))}
        </div>
      </aside>

      <section>
        {cur && <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Version {cur.n} · {ago(cur.capturedAt)}</h2>
            <div className="tabs" style={{ margin: 0, border: 0 }}>
              {(["shot", "diff", "text"] as const).map((t) => <button key={t} className={view === t ? "on" : ""} onClick={() => setView(t)}>{t === "shot" ? "Screenshot" : t === "diff" ? "What changed" : "Page text"}</button>)}
            </div>
          </div>
          <p className="muted">Source: <a href={p.source} target="_blank" rel="noreferrer">{p.source}</a> · via TinyFish Monitor ({cur.tf.source}){cur.tf.judgment?.summary && ` · ${cur.tf.judgment.summary}`}</p>
          {view === "shot" && (cur.shot ? <div className="shot"><img src={cur.shot} alt={`${p.name} v${cur.n}`} /></div> : <p className="err">No screenshot: {cur.shotError ?? "not captured"}</p>)}
          {view === "diff" && (cur.baseline ? <p className="muted">First capture — nothing to compare against.</p> : full?.diffFromPrevious ? <DiffView d={full.diffFromPrevious} /> : <p className="muted">Loading…</p>)}
          {view === "text" && <pre className="txt">{full?.text ?? "Loading…"}</pre>}
        </div>}

        {vs.length > 1 && <form className="panel" onSubmit={compare}>
          <h2>Compare any two dates</h2>
          <div className="row">
            <input required placeholder="From: date or version #" list="vers" value={cmp.from} onChange={(e) => setCmp({ ...cmp, from: e.target.value })} />
            <span>→</span>
            <input required placeholder="To: date or version #" list="vers" value={cmp.to} onChange={(e) => setCmp({ ...cmp, to: e.target.value })} />
            <datalist id="vers">{vs.map((v) => <option key={v.n} value={v.n} label={ago(v.capturedAt)} />)}</datalist>
            <button className="pri">Diff</button>
            <button type="button" onClick={() => setCmp({ from: String(vs[vs.length - 1].n), to: String(vs[0].n) })}>Oldest → latest</button>
          </div>
          {cmpRes && <div style={{ marginTop: 12 }}>{cmpRes.error ? <p className="err">{cmpRes.error}</p> : <><p className="muted">v{cmpRes.from.version} → v{cmpRes.to.version} <Chips s={cmpRes.stats} /></p><DiffView d={cmpRes} /></>}</div>}
        </form>}
      </section>
    </div>
  </>);
}
