// File-backed store: data/pages/<id>.json + data/shots/<id>/<n>.jpg
// ponytail: local disk + in-process queue per page; swap for Postgres + S3/R2 if deployed serverless.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import type { Diff } from "./diff";

export type Version = {
  n: number;
  capturedAt: string;
  title: string | null;
  text: string;
  shot: string | null; // URL path served by /api/shots
  shotError?: string;
  baseline: boolean;
  summary?: { added: number; removed: number; changed: number; values: Diff["values"] };
  tf: { runId?: string; outcome?: string; judgment?: unknown; source: "create" | "run-now" | "webhook" };
};
export type LogEntry = { at: string; source: Version["tf"]["source"]; runId?: string; result: "baseline" | "changed" | "unchanged" | "noise-ignored" | "variant-flip" | "pending" | "error"; version?: number; detail?: string };
export type Page = {
  id: string;
  monitorId: string;
  url: string;
  name: string;
  category: string;
  createdAt: string;
  schedule: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  checks: number;
  noiseIgnored: number;
  rawHash?: string;
  pending?: { sig: string; firstSeen: string }; // unseen state awaiting a 2nd consecutive sighting
  log: LogEntry[];
  versions: Version[];
};

export const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dir = path.join(DATA, "pages");
export const pageId = (url: string) => createHash("sha1").update(url.trim().replace(/\/$/, "")).digest("hex").slice(0, 10);

const queues = new Map<string, Promise<unknown>>();
/** Serialize all mutations of one page (webhook + poller can race). */
export function withPage<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) ?? Promise.resolve()).then(fn, fn);
  queues.set(id, next.catch(() => {}));
  return next;
}

// Storage backend: Postgres when DATABASE_URL is set (Render free tier has no disk), local files otherwise.
let pool: Pool | undefined;
const sql = async () => {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    const url = process.env.DATABASE_URL;
    pool = new Pool({ connectionString: url, max: 5, ssl: /@[^/]*\./.test(url) ? { rejectUnauthorized: false } : undefined });
    await pool.query("create table if not exists pages(id text primary key, data jsonb not null)");
    await pool.query("create table if not exists shots(id text, n int, img bytea not null, primary key(id, n))");
  }
  return pool;
};
const norm = (p: Page) => { p.log ??= []; p.noiseIgnored ??= 0; return p; };

export async function getPage(id: string): Promise<Page | null> {
  const db = await sql();
  if (db) { const r = await db.query("select data from pages where id=$1", [id]); return r.rows[0] ? norm(r.rows[0].data) : null; }
  try { return norm(JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), "utf8"))); } catch { return null; }
}
export async function savePage(p: Page) {
  const db = await sql();
  if (db) { await db.query("insert into pages(id,data) values($1,$2) on conflict(id) do update set data=$2", [p.id, JSON.stringify(p)]); return; }
  await fs.mkdir(dir, { recursive: true });
  const f = path.join(dir, `${p.id}.json`);
  await fs.writeFile(f + ".tmp", JSON.stringify(p));
  await fs.rename(f + ".tmp", f);
}
export async function listPages(): Promise<Page[]> {
  const db = await sql();
  if (db) return (await db.query("select data from pages")).rows.map((r) => norm(r.data));
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    return (await Promise.all(files.map((f) => getPage(f.slice(0, -5))))).filter(Boolean) as Page[];
  } catch { return []; }
}
export async function deletePage(id: string) {
  const db = await sql();
  if (db) { await db.query("delete from pages where id=$1", [id]); await db.query("delete from shots where id=$1", [id]); return; }
  await fs.rm(path.join(dir, `${id}.json`), { force: true });
  await fs.rm(path.join(DATA, "shots", id), { recursive: true, force: true });
}
export async function saveShot(id: string, n: number, buf: Buffer) {
  const db = await sql();
  if (db) await db.query("insert into shots(id,n,img) values($1,$2,$3) on conflict(id,n) do update set img=$3", [id, n, buf]);
  else {
    const d = path.join(DATA, "shots", id);
    await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(d, `${n}.jpg`), buf);
  }
  return `/api/shots/${id}/${n}.jpg`;
}
export async function moveShot(id: string, from: number, to: number) {
  const db = await sql();
  if (db) await db.query("update shots set n=$3 where id=$1 and n=$2", [id, from, to]);
  else await fs.rename(path.join(DATA, "shots", id, `${from}.jpg`), path.join(DATA, "shots", id, `${to}.jpg`)).catch(() => {});
}
export async function deleteShot(id: string, n: number) {
  const db = await sql();
  if (db) await db.query("delete from shots where id=$1 and n=$2", [id, n]);
  else await fs.rm(path.join(DATA, "shots", id, `${n}.jpg`), { force: true });
}
export async function getShot(id: string, n: number): Promise<Buffer | null> {
  const db = await sql();
  if (db) return (await db.query("select img from shots where id=$1 and n=$2", [id, n])).rows[0]?.img ?? null;
  try { return await fs.readFile(path.join(DATA, "shots", id, `${n}.jpg`)); } catch { return null; }
}

/** Version metadata without the heavy text. */
export const slim = (v: Version) => ({ ...v, text: undefined, chars: v.text.length });
export const card = (p: Page) => {
  const last = p.versions[p.versions.length - 1];
  return {
    id: p.id, name: p.name, url: p.url, category: p.category, monitorId: p.monitorId, schedule: p.schedule,
    createdAt: p.createdAt, lastCheckedAt: p.lastCheckedAt, lastError: p.lastError, checks: p.checks, noiseIgnored: p.noiseIgnored ?? 0,
    versionCount: p.versions.length, changes: p.versions.length - 1,
    latestShot: last?.shot ?? null, lastChangeAt: p.versions.length > 1 ? last.capturedAt : null,
  };
};

/** Version live at `date` (date-only inputs mean end of that UTC day). */
export function asOf(p: Page, date: string): Version | null {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + "T23:59:59.999Z") : Date.parse(date);
  if (Number.isNaN(t)) return null;
  let hit: Version | null = null;
  for (const v of p.versions) if (Date.parse(v.capturedAt) <= t) hit = v;
  return hit;
}

/** "3" -> version 3; "2026-11-10" or ISO -> version live at that moment. */
export const resolve = (p: Page, ref: string | null) =>
  !ref ? null : /^\d+$/.test(ref) ? p.versions.find((v) => v.n === Number(ref)) ?? null : asOf(p, ref);
