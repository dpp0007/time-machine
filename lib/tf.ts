// TinyFish client: Monitor (core), Browser API (screenshots). Fetch runs inside Page Monitors.
import { chromium } from "playwright-core";

const KEY = () => {
  if (!process.env.TINYFISH_API_KEY) throw new Error("TINYFISH_API_KEY is not set (see .env.example)");
  return process.env.TINYFISH_API_KEY;
};
const H = () => ({ "X-API-Key": KEY(), "Content-Type": "application/json" });

export type FetchResult = { url: string; final_url?: string; title: string | null; text: string | null };
export type MonitorRun = {
  id: string;
  is_baseline?: boolean;
  outcome?: string;
  diff?: string | null;
  judgment?: unknown;
  results?: FetchResult[];
  errors?: { url?: string; error?: string }[];
};

async function call<T>(base: string, p: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + p, { ...init, headers: { ...H(), ...init?.headers }, signal: AbortSignal.timeout(110_000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`TinyFish ${r.status} ${p}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : ({} as T);
}
const AGENT = "https://agent.tinyfish.ai";

// Ads, cookie banners, tracking widgets: removed by TinyFish before it compares runs.
const EXCLUDE = [
  "script", "style", "noscript", "iframe",
  "[id*='cookie' i]", "[class*='cookie' i]", "[class*='consent' i]", "[id*='onetrust' i]",
  "[class*='advert' i]", "[id*='google_ads']", "[class*='chat-widget' i]",
];

export async function createMonitor(url: string, name: string, schedule: string, webhook?: string) {
  return call<{ monitor: { id: string }; run: MonitorRun }>(AGENT, "/v1/monitors", {
    method: "POST",
    body: JSON.stringify({
      type: "fetch",
      name: name.slice(0, 100),
      config: { url, format: "markdown", exclude_selectors: EXCLUDE },
      schedule_cron: schedule,
      purpose: "Any change to prices, plans, fees, rules, terms or policy wording",
      ...(webhook ? { webhook_url: webhook } : {}),
    }),
  });
}
export const runMonitor = (id: string) => call<{ run: MonitorRun }>(AGENT, `/v1/monitors/${id}/runs`, { method: "POST" });
export const updateSchedule = (id: string, schedule_cron: string) =>
  call(AGENT, `/v1/monitors/${id}`, { method: "PATCH", body: JSON.stringify({ schedule_cron }) });
export const deleteMonitor = (id: string) => call(AGENT, `/v1/monitors/${id}`, { method: "DELETE" });
export const listMonitors = () => call<{ monitors: { id: string; status: string }[] }>(AGENT, "/v1/monitors");

/** Full-page screenshot through a TinyFish remote browser (Browser API + CDP). */
export async function screenshot(url: string): Promise<Buffer> {
  const s = await call<{ session_id: string; cdp_url: string }>("https://api.browser.tinyfish.ai", "", {
    method: "POST",
    body: JSON.stringify({ url, timeout_seconds: 120 }),
  });
  try {
    const browser = await chromium.connectOverCDP(s.cdp_url, { timeout: 60_000 });
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.setViewportSize({ width: 1280, height: 900 });
    if (page.url() === "about:blank" || !page.url().startsWith("http")) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // hide cookie/consent overlays so the stored screenshot shows the page, not the banner
    await page.addStyleTag({ content: "[id*='cookie' i],[class*='cookie' i],[id*='consent' i],[class*='consent' i],#onetrust-consent-sdk,#onetrust-banner-sdk,[aria-label*='cookie' i]{display:none!important}" }).catch(() => {});
    await page.waitForTimeout(400);
    const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: true }).catch(() => page.screenshot({ type: "jpeg", quality: 70 }));
    await browser.close().catch(() => {});
    return buf;
  } finally {
    fetch(`https://api.browser.tinyfish.ai/${s.session_id}`, { method: "DELETE", headers: H() }).catch(() => {});
  }
}
