import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders The People’s Isle election hub", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The People’s Isle/);
  assert.match(html, /Your Isle/);
  assert.match(html, /Your Future/);
  assert.match(html, /Living Atlas/);
  assert.match(html, /Election Desk/);
  assert.match(html, /Choose an area/);
  assert.match(html, /No account, address or postcode is requested/);
  assert.match(html, /North-up 3D terrain map of the Isle of Man/);
  assert.match(html, /high-resolution elevation data/);
  assert.match(html, /relief shown at 5×/);
  assert.match(html, /OUR ACTUAL ISLAND/);
  assert.match(html, /Representative points · boundaries not shown/);
  assert.match(html, /Official source/);
  assert.match(html, /Research monitor/);
  assert.match(html, /The source watch/);
  assert.match(html, /Discovery is not publication/);
  assert.match(html, /Configured for periodic checks/);
  assert.match(html, /New records stay private until a human reviews them/);
  assert.match(html, /Reviewed source preview/);
  assert.doesNotMatch(html, /All reviewed updates|Auditable for years|original source/i);
  assert.match(html, /waits for proposition-level evidence review/);
  assert.doesNotMatch(
    html,
    /Claire Christian|Rob Callister|Rachel Glover|Peter Shimmin|Tim Johnston|Steve Curphey/,
  );
  assert.match(html, /12/);
  assert.match(html, /constituencies/i);
  assert.match(html, /Vote compass/i);
  assert.match(html, /David Searle/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("candidate pages fail closed when the verified live profile is unavailable", async () => {
  const response = await render("/candidates/claire-christian");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.doesNotMatch(html, /Claire Christian|Founder preview|reviewer_id|storage_key/i);
});

test("server-renders the private compass", async () => {
  const response = await render("/compass");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /What do you want the next Keys to change/);
  assert.match(html, /Nothing is sent to The People’s Isle/);
});

test("server-renders the election desk with a separate public research monitor", async () => {
  const response = await render("/latest");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /The election desk/);
  assert.match(html, /Approved evidence library/);
  assert.match(html, /What the reviewed sources cover/);
  assert.match(html, /temporarily unavailable/);
  assert.match(html, /Candidate association is not treated as a policy position or endorsement/i);
  assert.match(html, /The source watch/);
  assert.match(html, /Discovery is not publication/);
  assert.doesNotMatch(html, /Unreviewed source stream|canonical_url|reviewer_id|snapshot_id/i);
});
