import { createHash } from "node:crypto";
import { diffText, signature } from "./diff";
import { createMonitor, deleteMonitor, runMonitor, screenshot, type MonitorRun } from "./tf";
import { deletePage, getPage, listPages, pageId, savePage, saveShot, withPage, type LogEntry, type Page, type Version } from "./store";

const SCHEDULE = () => process.env.SCHEDULE_CRON || "0 */3 * * *";
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
    if (prev && signature(prev.text) === signature(text)) {
      const noisy = !!p.rawHash && p.rawHash !== raw; // text differed, but only in dates/ids/tracking
      if (noisy) p.noiseIgnored++;
      p.rawHash = raw;
      note(p, { source, runId: run.id, result: noisy ? "noise-ignored" : "unchanged" });
      await savePage(p);
      return { changed: false, noise: noisy };
    }
    p.rawHash = raw;
    const v: Version = {
      n: p.versions.length + 1,
      capturedAt: now,
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
    return { changed: !!prev, version: v.n };
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

export async function checkPage(id: string) {
  const p = await getPage(id);
  if (!p) throw new Error("not found");
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
      try { out.push({ id: p.id, ...(await checkPage(p.id)) }); }
      catch (e) { out.push({ id: p.id, error: String((e as Error).message).slice(0, 200) }); }
    }
  }));
  return out;
}
