import { diffText, signature } from "../lib/diff.ts";
import assert from "node:assert";

const a = "# Pricing\nPro: $20/month\nTeam: $40/month\nLast updated March 5, 2025\n© 2025 Acme\n[Docs](https://x.com/d?utm_source=a1)";
const b = "# Pricing\nPro: $25/month\nLast updated June 9, 2026\n© 2026 Acme\nNew Enterprise plan\n[Docs](https://x.com/d?utm_source=zz)";
// noise-only edits must not change the signature
assert.equal(signature(a), signature(a.replace("March 5, 2025", "May 1, 2024").replace("2025", "2026").replace("utm_source=a1", "utm_source=q")));
const d = diffText(a, b);
assert.equal(d.stats.changed, 1);
assert.equal(d.values[0].from, "$20");
assert.equal(d.values[0].to, "$25");
assert.deepEqual(d.removed, ["Team: $40/month"]);
assert.deepEqual(d.added, ["New Enterprise plan"]);
console.log("diff ok", JSON.stringify(d.stats));
