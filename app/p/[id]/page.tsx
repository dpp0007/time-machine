"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Diff } from "@/lib/diff";
import { Chips, DiffView, Values, adminFetch, ago, clock, host, rel } from "../../DiffView";

type Sum = { added: number; removed: number; changed: number; values: { from: string; to: string }[] };
type V = { n: number; capturedAt: string; title: string | null; shot: string | null; shotError?: string; baseline: boolean; chars: number; summary?: Sum; tf: { runId?: string; source: string; judgment?: { summary?: string } | null } };
type L = { at: string; source: string; runId?: string; result: string; version?: number; detail?: string };
type P = { id: string; name: string; source: string; category: string; monitorId: string; schedule: string; lastCheckedAt: string | null; lastError: string | null; checks: number; noiseIgnored: number; log: L[]; versions: V[] };
type Full = { text: string; diffFromPrevious: Diff | null };

const cronText = (c: string) => (c === "0 * * * *" ? "hourly" : /^0 \*\/(\d+) \* \* \*$/.test(c) ? `every ${c.match(/\/(\d+)/)![1]}h` : c);
const pillFor = (r: string) => (r === "changed" ? "c" : r === "error" ? "r" : r === "baseline" || r === "pending" ? "n" : "a");
const label = (r: string) => (r === "unchanged" ? "no change" : r === "noise-ignored" ? "noise ignored" : r === "variant-flip" ? "variant flip ignored" : r);

export default function PageDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<P | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  const [view, setView] = useState<"shot" | "diff" | "text">("shot");
  const [date, setDate] = useState("");
  const [asof, setAsof] = useState<{ version?: number; capturedAt?: string; validUntil?: string | null; error?: string; firstCapturedAt?: string } | null>(null);
  const [cmp, setCmp] = useState({ from: "", to: "" });
  const [cmpRes, setCmpRes] = useState<(Diff & { error?: string; from: { version: number }; to: { version: number } }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ t: string; k: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/pages/${id}`);
    if (!r.ok) return router.push("/");
    const j: P = await r.json();
    setP(j);
    setSel((s) => s ?? (Number(new URLSearchParams(location.search).get("v")) || j.versions[0]?.n || null));
  }, [id, router]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (sel == null) return;
    setFull(null);
    fetch(`/api/pages/${id}/versions/${sel}`).then((r) => r.json()).then(setFull);
  }, [sel, id]);

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
    setBusy(true); setRes({ t: "Asking TinyFish Monitor for a fresh run…", k: "" });
    const r = await fetch(`/api/pages/${id}/check`, { method: "POST" });
    const j = await r.json();
    const at = clock(j.checkedAt ?? new Date().toISOString());
    if (!r.ok) setRes({ t: j.error, k: "bad" });
    else if (j.error) setRes({ t: `Check at ${at} failed: ${j.error}`, k: "bad" });
    else if (j.changed) { setRes({ t: `Change caught at ${at}. Saved as version ${j.version} with a new screenshot.`, k: "warn" }); setSel(j.version); }
    else if (j.variant) setRes({ t: `Checked at ${at}. The page showed an alternate variant of content we already recorded, so it was ignored.`, k: "ok" });
    else if (j.pending) setRes({ t: `Checked at ${at}. New content seen once; it will be recorded if the next check confirms it (filters one-off flickers).`, k: "warn" });
    else setRes({ t: `Checked at ${at}. No meaningful change since version ${j.comparedTo}${j.noise ? " (only dates or tracking noise differed, ignored)" : ""}.`, k: "ok" });
    await load(); setBusy(false);
  };
  const del = async () => {
    if (!confirm("Delete this page, its Monitor and all of its history?")) return;
    const r = await adminFetch(`/api/pages/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/"); else setRes({ t: "Delete refused (admin token needed).", k: "bad" });
  };

  if (!p) return <p className="muted">Loading…</p>;
  const vs = p.versions, cur = vs.find((v) => v.n === sel), latest = vs[0];
  const lastLog = p.log[0];
  // checks that confirmed a version was still current
  const verified = (v: V) => {
    const next = vs.find((x) => x.n === v.n + 1);
    return p.log.filter((e) => (e.result === "unchanged" || e.result === "noise-ignored") && e.at >= v.capturedAt && (!next || e.at < next.capturedAt)).length;
  };
  const changes = vs.length - 1;
  const state = p.lastError ? "bad" : changes ? "warn" : "ok";

  return (<>
    <Link href="/" className="crumb">← All pages</Link>
    <div className="dh">
      <div>
        <h1>{p.name}</h1>
        <div className="chips">
          <span className="pill n">{p.category}</span>
          <a className="link sm" href={p.source} target="_blank" rel="noreferrer">{host(p.source)} ↗</a>
          <span className="muted sm">checked {cronText(p.schedule)} · Monitor <code>{p.monitorId.slice(0, 8)}</code></span>
        </div>
      </div>
      <div className="row2">
        <button className="pri" onClick={check} disabled={busy}>{busy ? "Checking…" : "Check now"}</button>
        <a className="btn" href={`/api/pages/${id}`} target="_blank">JSON</a>
        <button className="danger" onClick={del}>Delete</button>
      </div>
    </div>

    <div className={"banner " + state}>
      <span className={"dot " + (state === "bad" ? "bad" : state === "warn" ? "warn" : "")} />
      <div>
        <b>
          {p.lastError ? `Last check failed: ${p.lastError}`
            : changes ? `${changes} change${changes === 1 ? "" : "s"} caught. Latest: version ${latest.n}, ${rel(latest.capturedAt)}`
            : `No changes yet. Version 1 is still current.`}
        </b>
        <span className="muted sm">
          {lastLog ? `Last Monitor run ${rel(lastLog.at)} (${clock(lastLog.at)}): ${label(lastLog.result)}. ` : "Waiting for the first re-check. "}
          {p.checks} run{p.checks === 1 ? "" : "s"} total · {p.noiseIgnored} noise-only edit{p.noiseIgnored === 1 ? "" : "s"} ignored
        </span>
      </div>
    </div>
    {res && <div className={"toast " + res.k} style={{ marginTop: -4, marginBottom: 14 }}>{res.t}</div>}

    <div className="dgrid">
      <div>
        {cur && <div className="panel">
          <h2>
            <span>Version {cur.n} <span className="muted sm" style={{ fontWeight: 400 }}>· {ago(cur.capturedAt)}</span></span>
            <span className="tabs">{(["shot", "diff", "text"] as const).map((t) => <button key={t} className={view === t ? "on" : ""} onClick={() => setView(t)}>{t === "shot" ? "Screenshot" : t === "diff" ? "What changed" : "Page text"}</button>)}</span>
          </h2>
          <p className="muted sm" style={{ margin: "0 0 12px" }}>
            Source <a className="link" href={p.source} target="_blank" rel="noreferrer">{p.source}</a> · captured via TinyFish Monitor ({cur.tf.source}){cur.tf.judgment?.summary && ` · ${cur.tf.judgment.summary}`}
          </p>
          {view === "shot" && (cur.shot ? <div className="shot"><img src={cur.shot} alt={`${p.name} version ${cur.n}`} /></div> : <p style={{ color: "var(--bad)" }}>No screenshot: {cur.shotError ?? "not captured"}</p>)}
          {view === "diff" && (cur.baseline
            ? <div className="empty" style={{ padding: 30 }}>This is the baseline capture, so there is nothing earlier to compare with.<br />When the page changes, the added, removed and edited lines will show here.</div>
            : full?.diffFromPrevious ? <DiffView d={full.diffFromPrevious} /> : <p className="muted">Loading…</p>)}
          {view === "text" && <pre className="txt">{full?.text ?? "Loading…"}</pre>}
        </div>}

        <form className="panel" onSubmit={compare}>
          <h2>Compare any two dates</h2>
          {vs.length < 2 && <p className="muted sm" style={{ marginTop: 0 }}>Only one version exists so far. Once the page changes you can diff any two points in its history here.</p>}
          <div className="row2">
            <input required placeholder="From: date or version #" list="vers" value={cmp.from} onChange={(e) => setCmp({ ...cmp, from: e.target.value })} />
            <span className="muted">→</span>
            <input required placeholder="To: date or version #" list="vers" value={cmp.to} onChange={(e) => setCmp({ ...cmp, to: e.target.value })} />
            <datalist id="vers">{vs.map((v) => <option key={v.n} value={v.n} label={ago(v.capturedAt)} />)}</datalist>
            <button className="pri">Diff</button>
          </div>
          {cmpRes && <div style={{ marginTop: 12 }}>{cmpRes.error ? <p style={{ color: "var(--bad)" }}>{cmpRes.error}</p> : <><p className="muted sm">Version {cmpRes.from.version} → {cmpRes.to.version} <Chips s={cmpRes.stats} /></p><DiffView d={cmpRes} /></>}</div>}
        </form>

        <div className="panel">
          <h2>Check history <a className="btn" href="/api/log" target="_blank">All pages (JSON)</a></h2>
          <p className="muted sm" style={{ marginTop: 0 }}>Every time TinyFish Monitor ran for this page and what we concluded.</p>
          <div style={{ overflowX: "auto" }}><table><thead><tr><th>Time</th><th>Result</th><th>Via</th><th>Run</th></tr></thead><tbody>
            {p.log.map((e, i) => <tr key={i}><td className="sm">{ago(e.at)}</td>
              <td><span className={"pill " + pillFor(e.result)}>{label(e.result)}</span> <span className="muted sm">{e.version ? `v${e.version} ` : ""}{e.detail}</span></td>
              <td className="sm">{e.source}</td><td><code>{e.runId?.slice(0, 8)}</code></td></tr>)}
          </tbody></table></div>
        </div>
      </div>

      <aside>
        <form className="panel" onSubmit={lookup}>
          <h2>What did it say on…</h2>
          <div className="row2"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /><button className="pri">Show</button></div>
          {asof && <p className="sm" style={{ margin: "10px 0 0", color: asof.error ? "var(--bad)" : "var(--mute)" }}>
            {asof.error ? `${asof.error}${asof.firstCapturedAt ? `. History starts ${ago(asof.firstCapturedAt)}.` : ""}`
              : `Version ${asof.version}, captured ${ago(asof.capturedAt!)}${asof.validUntil ? `, replaced ${ago(asof.validUntil)}` : ", still current"}`}
          </p>}
        </form>

        <div className="panel">
          <h2>Timeline <span className="muted sm" style={{ fontWeight: 400 }}>{vs.length} version{vs.length === 1 ? "" : "s"}</span></h2>
          <div className="tl">
            {vs.map((v) => {
              const n = verified(v), isCur = v.n === latest.n;
              return (
                <button key={v.n} className={"tv " + (sel === v.n ? "on " : "") + (isCur ? "cur" : "")} onClick={() => { setSel(v.n); setView("shot"); }}>
                  <i />
                  <div className="box">
                    <div className="t" style={v.shot ? { backgroundImage: `url(${v.shot})` } : {}} />
                    <div>
                      <b>v{v.n}</b> <span className="muted sm">{ago(v.capturedAt)}</span>
                      <div style={{ margin: "3px 0" }}><Chips s={v.baseline ? undefined : v.summary} /> <Values v={v.summary?.values.slice(0, 2)} /></div>
                      {isCur
                        ? <div className="sm" style={{ color: "var(--ok)" }}>Current · confirmed unchanged {n}×{lastLog && n ? `, last ${rel(lastLog.at)}` : ""}</div>
                        : <div className="sm faint">Replaced · was current {n ? `through ${n} check${n === 1 ? "" : "s"}` : "briefly"}</div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  </>);
}
