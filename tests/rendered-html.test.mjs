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
  assert.match(html, /Open evidence profile for Claire Christian, Douglas South/);
  assert.match(html, /12/);
  assert.match(html, /constituencies/i);
  assert.match(html, /Vote compass/i);
  assert.match(html, /David Searle/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("candidate cards lead to a complete candidate profile", async () => {
  const response = await render("/candidates/claire-christian");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Claire Christian/);
  assert.match(html, /Stated priorities/);
  assert.match(html, /Issue record/);
  assert.match(html, /Original evidence/);
  assert.match(html, /Campaign evidence/);
  assert.match(html, /Evidence overview/);
  assert.match(html, /Overview status/);
  assert.match(html, /A generated campaign-platform overview has not yet been published/);
  assert.match(html, /not how they are doing/);
  assert.match(html, /not a measure of popularity, momentum or likelihood of election/);
  assert.doesNotMatch(html, /Founder preview|Founder workspace|Private analysis queue|Analysis workflow/);
  assert.doesNotMatch(html, /reviewer_id|storage_key|Review [0-9a-f]{8}/i);
  assert.match(html, /Animated profile placeholder for Claire Christian/);
  assert.match(html, /Meet another candidate/);
  assert.match(html, /data-profile-reveal/);
});

test("server-renders the private compass", async () => {
  const response = await render("/compass");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /What do you want the next Keys to change/);
  assert.match(html, /Nothing is sent to The People’s Isle/);
});
