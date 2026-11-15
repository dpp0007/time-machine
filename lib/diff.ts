// Noise-aware structured diff for markdown page text.
export type Seg = { op: "eq" | "add" | "del"; text: string };
export type Diff = {
  stats: { added: number; removed: number; changed: number };
  added: string[];
  removed: string[];
  changed: { before: string; after: string; segments: Seg[] }[];
  values: { from: string; to: string; context: string }[];
};

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NOISE: [RegExp, string][] = [
  [/^\W*(?:request|trace|session|correlation|transaction|build|nonce|csrf)[ _-]?(?:id|token)\b.*$/gim, "<id-line>"],
  [/^\W*(?:request|trace|session|correlation|transaction|build|nonce|csrf)[ _-]?(?:id|token).*$/gi, "<id-line>"],
  [/\]\((https?:[^)\s]*?)(?:[?#][^)\s]*)?\)/g, "]($1)"], // drop query/hash tracking on links
  [new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"), "<date>"],
  [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?\\s+\\d{4}\\b`, "gi"), "<date>"],
  [/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b/g, "<date>"],
  [/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, "<date>"],
  [/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi, "<time>"],
  [/(?:©|\(c\)|copyright)\s*\d{4}(?:\s*[-–]\s*\d{4})?/gi, "©"],
  [/\b\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago\b/gi, "<ago>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-\d+)?\b/gi, "<id>"],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}\b/g, "<id>"], // tracking/session tokens
];

/** Comparison key for a line: volatile tokens (dates, ids, tracking params, ©year) masked. */
export function key(line: string): string {
  let s = line;
  for (const [re, to] of NOISE) s = s.replace(re, to);
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
/** Noise-masked content: equal signature == no meaningful change. */
export const signature = (t: string) => lines(t).map(key).join("\n");

type Op = { op: "eq" | "del" | "add"; i?: number; j?: number };

function lcsOps(a: string[], b: string[]): Op[] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb), n = A.length, m = B.length;
  const w = m + 1, dp = new Uint16Array((n + 1) * w); // ponytail: Uint16 caps a differing block at 65k lines
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const ops: Op[] = [];
  for (let i = 0; i < s; i++) ops.push({ op: "eq", i, j: i });
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push({ op: "eq", i: s + i, j: s + j }); i++; j++; }
    else if (j >= m || (i < n && dp[(i + 1) * w + j] >= dp[i * w + j + 1])) ops.push({ op: "del", i: s + i++ });
    else ops.push({ op: "add", j: s + j++ });
  }
  for (let k = 0; k < a.length - ea; k++) ops.push({ op: "eq", i: ea + k, j: eb + k });
  return ops;
}

const toks = (s: string) => s.match(/\s+|[\p{L}\p{N}$€£₹%.,'-]+|[^\s]/gu) ?? [];
const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}$€£₹%.]+/gu) ?? []);
function sim(a: string, b: string) {
  const x = words(a), y = words(b);
  let c = 0;
  x.forEach((t) => y.has(t) && c++);
  return c / (x.size + y.size - c || 1);
}

function wordDiff(a: string, b: string): Seg[] {
  const A = toks(a), B = toks(b), out: Seg[] = [];
  for (const o of lcsOps(A, B)) {
    const text = o.op === "add" ? B[o.j!] : A[o.i!];
    const last = out[out.length - 1];
    if (last && last.op === o.op) last.text += text; else out.push({ op: o.op, text });
  }
  return out;
}

const NUM = /[$€£₹]\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d[\d,]*(?:\.\d+)?\b/g;
function valueChanges(before: string, after: string) {
  const x = before.match(NUM) ?? [], y = after.match(NUM) ?? [], out: Diff["values"] = [];
  if (x.length === y.length) x.forEach((v, k) => v !== y[k] && out.push({ from: v, to: y[k], context: after.slice(0, 120) }));
  return out;
}

export function diffText(oldText: string, newText: string): Diff {
  const a = lines(oldText), b = lines(newText);
  const ops = lcsOps(a.map(key), b.map(key));
  const d: Diff = { stats: { added: 0, removed: 0, changed: 0 }, added: [], removed: [], changed: [], values: [] };
  for (let k = 0; k < ops.length; ) {
    if (ops[k].op === "eq") { k++; continue; }
    const dels: string[] = [], adds: string[] = [];
    while (k < ops.length && ops[k].op !== "eq") { const o = ops[k++]; if (o.op === "del") dels.push(a[o.i!]); else adds.push(b[o.j!]); }
    const used = new Set<number>();
    for (const del of dels) {
      let best = -1, bs = 0.5;
      adds.forEach((ad, idx) => { const s = used.has(idx) ? 0 : sim(del, ad); if (s >= bs) { bs = s; best = idx; } });
      if (best < 0) { d.removed.push(del); continue; }
      used.add(best);
      d.changed.push({ before: del, after: adds[best], segments: wordDiff(del, adds[best]) });
      d.values.push(...valueChanges(del, adds[best]));
    }
    adds.forEach((ad, idx) => { if (!used.has(idx)) d.added.push(ad); });
  }
  d.stats = { added: d.added.length, removed: d.removed.length, changed: d.changed.length };
  return d;
}

/** Which versions survive flap-compaction? Drop a version if its state was already seen (recurrence)
 *  or it was a one-step excursion that immediately returned to the previous state (A -> B -> A). */
export function keepMask(sigs: string[]): boolean[] {
  const seen = new Set<string>();
  return sigs.map((s, k) => {
    const drop = k > 0 && (seen.has(s) || (k + 1 < sigs.length && sigs[k + 1] === sigs[k - 1]));
    seen.add(s);
    return !drop;
  });
}
