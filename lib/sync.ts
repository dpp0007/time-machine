import { createHash } from "node:crypto";
import { diffText, keepMask, signature } from "./diff";
import { createMonitor, deleteMonitor, runMonitor, screenshot, updateSchedule, type MonitorRun } from "./tf";
import { deletePage, deleteShot, getPage, moveShot, listPages, pageId, savePage, saveShot, withPage, type LogEntry, type Page, type Version } from "./store";

const SCHEDULE = () => process.env.SCHEDULE_CRON || "0 * * * *";
const webhook = () =>
  process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/webhook/monitor?s=${encodeURIComponent(process.env.WEBHOOK_SECRET || "")}` : undefined;

const note = (p: Page, e: Omit<LogEntry, "at">) => { p.log.push({ at: new Date().toISOString(), ...e }); if (p.log.length > 1000) p.log.shift(); };

/** Core: turn one TinyFish Monitor run into history. A new version exists only if the noise-masked text changed. */
export function ingest(id: string, run: MonitorRun, source: Version["tf"]["source"]) {
  return withPage(id, async () => {
    const p = await getPage(id);
    if (!p) throw new Error("unknown page " + id);
    const now = new Date().toISOString();
    p.lastCheckedAt = now;
    p.checks++;
    const res = run.results?.[0];
    const text = typeof res?.text === "string" ? res.text : null;
    if (!text?.trim()) {
      p.lastError = run.errors?.[0]?.error ?? "empty result";
      note(p, { source, runId: run.id, result: "error", detail: p.lastError });
      await savePage(p);
      return { changed: false, error: p.lastError };
    }
    p.lastError = null;
    const prev = p.versions[p.versions.length - 1];
    const raw = createHash("sha1").update(text).digest("hex");
    const sig = signature(text), sigHash = createHash("sha1").update(sig).digest("hex");
    if (prev && signature(prev.text) === sig) {
      const noisy = !!p.rawHash && p.rawHash !== raw; // text differed, but only in dates/ids/tracking
      if (noisy) p.noiseIgnored++;
      p.rawHash = raw;
      p.pending = undefined;
      note(p, { source, runId: run.id, result: noisy ? "noise-ignored" : "unchanged" });
      await savePage(p);
      return { changed: false, noise: noisy, comparedTo: prev.n, checkedAt: now };
    }
    if (prev) {
      // Pages that serve alternate variants (A/B tests, regional or partial renders) flip between states we have already recorded.
      const known = p.versions.find((x) => signature(x.text) === sig);
      if (known) {
        p.noiseIgnored++; p.rawHash = raw; p.pending = undefined;
        note(p, { source, runId: run.id, result: "variant-flip", detail: `alternate state, same as v${known.n}` });
        await savePage(p);
        return { changed: false, variant: true, comparedTo: prev.n, checkedAt: now };
      }
      // A brand-new state must be seen on two consecutive checks before it becomes a version (filters one-off partial renders).
      if (p.pending?.sig !== sigHash) {
        p.pending = { sig: sigHash, firstSeen: now };
        note(p, { source, runId: run.id, result: "pending", detail: "new content seen once, waiting for the next check to confirm" });
        await savePage(p);
        return { changed: false, pending: true, comparedTo: prev.n, checkedAt: now };
      }
    }
    const since = p.pending?.firstSeen ?? now;
    p.pending = undefined;
    p.rawHash = raw;
    const v: Version = {
      n: p.versions.length + 1,
      capturedAt: since,
      title: res?.title ?? null,
      text,
      shot: null,
      baseline: !prev,
      tf: { runId: run.id, outcome: run.outcome, judgment: run.judgment, source },
    };
    if (prev) {
      const d = diffText(prev.text, text);
      v.summary = { ...d.stats, values: d.values.slice(0, 20) };
    }
    try {
      v.shot = await saveShot(id, v.n, await screenshot(res?.final_url || p.url));
    } catch (e) {
      v.shotError = String((e as Error).message).slice(0, 200);
    }
    p.versions.push(v);
    note(p, { source, runId: run.id, result: prev ? "changed" : "baseline", version: v.n, detail: v.summary ? `+${v.summary.added} -${v.summary.removed} ~${v.summary.changed}` : undefined });
    await savePage(p);
    return { changed: !!prev, version: v.n, checkedAt: now };
  });
}

export async function addPage(url: string, name: string, category: string) {
  new URL(url); // validates
  const id = pageId(url);
  if (await getPage(id)) return { id, existed: true };
  const { monitor, run } = await createMonitor(url, name, SCHEDULE(), webhook());
  const page: Page = {
    id, monitorId: monitor.id, url, name, category: category || "Other", createdAt: new Date().toISOString(),
    schedule: SCHEDULE(), lastCheckedAt: null, lastError: null, checks: 0, noiseIgnored: 0, log: [], versions: [],
  };
  await savePage(page);
  await ingest(id, run, "create"); // baseline = version 1 + screenshot
  return { id, existed: false };
}

const lastRun = new Map<string, number>();
export async function checkPage(id: string, force = false) {
  const p = await getPage(id);
  if (!p) throw new Error("not found");
  // each run-now costs credit; public "Check now" is limited to once a minute per page
  if (!force && Date.now() - (lastRun.get(id) ?? 0) < 60_000) throw new Error("cooldown: this page was just checked, try again in a minute");
  lastRun.set(id, Date.now());
  const { run } = await runMonitor(p.monitorId);
  return ingest(id, run, "run-now");
}

export async function removePage(id: string) {
  const p = await getPage(id);
  if (!p) return;
  await deleteMonitor(p.monitorId).catch(() => {});
  await deletePage(id);
}

/** Run every page's Monitor now, 3 at a time. Used by the local poller, the cron route and the UI button. */
export async function syncAll() {
  const pages = await listPages();
  const out: { id: string; changed?: boolean; error?: string }[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < pages.length) {
      const p = pages[i++];
      try { out.push({ id: p.id, ...(await checkPage(p.id, true)) }); }
      catch (e) { out.push({ id: p.id, error: String((e as Error).message).slice(0, 200) }); }
    }
  }));
  return out;
}

/** Point every Monitor (and our stored copy) at the current SCHEDULE_CRON. */
export async function reschedule() {
  const cron = SCHEDULE();
  const out: { id: string; ok: boolean; error?: string }[] = [];
  for (const p of await listPages()) {
    try {
      await updateSchedule(p.monitorId, cron);
      await withPage(p.id, async () => { const q = await getPage(p.id); if (q) { q.schedule = cron; await savePage(q); } });
      out.push({ id: p.id, ok: true });
    } catch (e) { out.push({ id: p.id, ok: false, error: String((e as Error).message).slice(0, 150) }); }
  }
  return { cron, results: out };
}

/** Retract trailing versions that are noise-only under the current rules (e.g. after improving the noise filter). */
export async function prune() {
  const out: { id: string; removed: number[] }[] = [];
  for (const p0 of await listPages()) {
    await withPage(p0.id, async () => {
      const p = await getPage(p0.id);
      if (!p) return;
      const removed: number[] = [];
      while (p.versions.length > 1 && signature(p.versions[p.versions.length - 1].text) === signature(p.versions[p.versions.length - 2].text)) {
        const v = p.versions.pop()!;
        removed.push(v.n);
        await deleteShot(p.id, v.n);
        for (const e of p.log) if (e.version === v.n && e.result === "changed") { e.result = "noise-ignored"; e.detail = "retracted: noise-only under updated filter"; e.version = undefined; }
        p.noiseIgnored++;
      }
      if (removed.length) { await savePage(p); out.push({ id: p.id, removed }); }
    });
  }
  return out;
}

/** Retroactively collapse flip-flop history (A,B,A,B...) to the distinct states, renumbering versions and screenshots. */
export async function compact() {
  const out: { id: string; kept: number; dropped: number }[] = [];
  for (const p0 of await listPages()) {
    await withPage(p0.id, async () => {
      const p = await getPage(p0.id);
      if (!p || p.versions.length < 2) return;
      const keep = keepMask(p.versions.map((v) => signature(v.text)));
      const dropped = keep.filter((k) => !k).length;
      if (!dropped) return;
      const map = new Map<number, number>();
      const kept: Version[] = [];
      p.versions.forEach((v, i) => { if (keep[i]) { map.set(v.n, kept.length + 1); kept.push(v); } else void deleteShot(p.id, v.n); });
      await Promise.all(p.versions.filter((v, i) => !keep[i]).map((v) => deleteShot(p.id, v.n)));
      for (const v of kept) {
        const to = map.get(v.n)!;
        if (to !== v.n) { await moveShot(p.id, v.n, to); if (v.shot) v.shot = `/api/shots/${p.id}/${to}.jpg`; }
        v.n = to;
      }
      for (const e of p.log) {
        if (e.version == null) continue;
        const to = map.get(e.version);
        if (to) e.version = to;
        else { e.result = "variant-flip"; e.detail = "retracted: page alternates between known states"; e.version = undefined; }
      }
      p.versions = kept; p.noiseIgnored += dropped; p.pending = undefined;
      await savePage(p);
      out.push({ id: p.id, kept: kept.length, dropped });
    });
  }
  return out;
}
