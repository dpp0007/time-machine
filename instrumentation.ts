// Local fallback for the TinyFish webhook: periodically trigger Monitor "run now" for every page.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const min = Number(process.env.POLL_MINUTES ?? 60);
  if (!min || !process.env.TINYFISH_API_KEY) return;
  const { syncAll } = await import("./lib/sync");
  setInterval(() => syncAll().catch((e) => console.error("[poll]", e)), min * 60_000);
  console.log(`[time-machine] polling Monitors every ${min} min`);
}
