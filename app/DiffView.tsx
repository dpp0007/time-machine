"use client";
import type { Diff } from "@/lib/diff";

export const ago = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function Chips({ s }: { s?: { added: number; removed: number; changed: number } }) {
  if (!s) return <span className="pill c">baseline</span>;
  return (<>
    {s.added > 0 && <span className="pill a">+{s.added} added</span>}
    {s.removed > 0 && <span className="pill r">−{s.removed} removed</span>}
    {s.changed > 0 && <span className="pill c">~{s.changed} changed</span>}
  </>);
}

export function DiffView({ d }: { d: Diff }) {
  const none = !d.stats.added && !d.stats.removed && !d.stats.changed;
  if (none) return <p className="muted">No meaningful differences (dates, ids and tracking noise are ignored).</p>;
  return (
    <div>
      {d.values.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {d.values.map((v, i) => <span key={i} className="val" title={v.context}><s>{v.from}</s> → <i>{v.to}</i></span>)}
        </div>
      )}
      {d.changed.map((c, i) => (
        <div key={i} className="d c">
          {c.segments.map((s, k) => s.op === "eq" ? <span key={k}>{s.text}</span> : s.op === "add" ? <ins key={k}>{s.text}</ins> : <del key={k}>{s.text}</del>)}
        </div>
      ))}
      {d.added.map((t, i) => <div key={"a" + i} className="d a">+ {t}</div>)}
      {d.removed.map((t, i) => <div key={"r" + i} className="d r">− {t}</div>)}
    </div>
  );
}
