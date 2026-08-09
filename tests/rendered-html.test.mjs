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
  assert.match(html, /People standing near you/);
  assert.match(html, /Interactive 3D terrain model of the Isle of Man/);
  assert.match(html, /high-resolution elevation data/);
  assert.match(html, /relief shown at 5×/);
  assert.match(html, /OUR ACTUAL ISLAND/);
  assert.match(html, /href="\/candidates\/claire-christian"/);
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
