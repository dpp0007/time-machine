const id = { name: "id", in: "path", required: true, schema: { type: "string" } };
const q = (name: string, d = "") => ({ name, in: "query", description: d, schema: { type: "string" } });
const op = (summary: string, parameters: object[] = []) => ({ get: { summary, parameters, responses: { 200: { description: "JSON" } } } });

/** GET /api/openapi -> machine-readable spec so other tools can generate clients. */
export const GET = () => Response.json({
  openapi: "3.0.3",
  info: { title: "Time Machine API", version: "1.0.0", description: "Version history for web pages, built on TinyFish Monitor." },
  paths: {
    "/api/pages": { ...op("List tracked pages"), post: { summary: "Track a new URL (creates a TinyFish Page Monitor)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string" }, name: { type: "string" }, category: { type: "string" } } } } } }, responses: { 200: { description: "JSON" } } } },
    "/api/pages/{id}": op("Version timeline with screenshots", [id]),
    "/api/pages/{id}/asof": op("Page content + screenshot as of a date", [id, q("date", "YYYY-MM-DD or ISO")]),
    "/api/pages/{id}/diff": op("Structured diff between two dates or version numbers", [id, q("from"), q("to")]),
    "/api/pages/{id}/versions/{n}": op("One version + diff vs previous", [id, { name: "n", in: "path", required: true, schema: { type: "integer" } }]),
    "/api/asof": op("Every page as of a date", [q("date")]),
    "/api/changes": op("Change feed", [q("limit")]),
    "/api/log": op("Monitor run log", [q("result", "changed|unchanged|noise-ignored|baseline|error"), q("limit")]),
    "/api/export": op("Full history export", [q("text", "include page text")]),
    "/api/feed.xml": op("Atom feed of changes"),
  },
});
