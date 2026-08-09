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

test("server-renders the Real Isle election hub", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Real Isle/);
  assert.match(html, /See the Island/);
  assert.match(html, /12/);
  assert.match(html, /constituencies/i);
  assert.match(html, /Vote compass/i);
  assert.match(html, /David Searle/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the private compass", async () => {
  const response = await render("/compass");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /What do you want the next Keys to change/);
  assert.match(html, /Nothing is sent to Real Isle/);
});
