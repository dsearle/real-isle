import assert from "node:assert/strict";
import test from "node:test";

import { parseFeed } from "../app/lib/evidence/feed.ts";
import { sha256Hex, stableJson } from "../app/lib/evidence/integrity.ts";

test("RSS observations are normalized without tracking fragments", () => {
  const [item] = parseFeed(
    `<?xml version="1.0"?><rss><channel><item>
      <guid>story-1</guid><title>Island &amp; election update</title>
      <link>https://news.example.im/story?utm_source=feed#comments</link>
      <description><![CDATA[<p>A <strong>source-linked</strong> summary.</p>]]></description>
      <pubDate>Sun, 09 Aug 2026 12:00:00 GMT</pubDate>
    </item></channel></rss>`,
    "https://news.example.im/feed.xml",
  );

  assert.equal(item.externalId, "story-1");
  assert.equal(item.title, "Island & election update");
  assert.equal(item.url, "https://news.example.im/story");
  assert.equal(item.summary, "A source-linked summary.");
  assert.equal(item.publishedAt, "2026-08-09T12:00:00.000Z");
});

test("unsupported and empty XML cannot masquerade as successful feeds", () => {
  assert.throws(
    () => parseFeed("<html><title>Request rejected</title></html>", "https://example.im/feed"),
    /not a supported RSS or Atom feed/,
  );
  assert.throws(
    () => parseFeed("<rss><channel /></rss>", "https://example.im/feed"),
    /contains no entries/,
  );
});

test("audit JSON has fixed key ordering and a stable digest", async () => {
  const payload = stableJson({ z: [3, { b: true, a: null }], a: "Real Isle" });
  assert.equal(payload, '{"a":"Real Isle","z":[3,{"a":null,"b":true}]}');
  assert.equal(
    await sha256Hex(payload),
    "9bcff3cdaee9a215a9a112d06a974b0da3b57ad3389207fa22b6d2b5c64dc2a1",
  );
  assert.throws(() => stableJson({ invalid: undefined }), /finite JSON values/);
});
