import assert from "node:assert/strict";
import test from "node:test";

import {
  candidateProfileMatchesExpectedIdentity,
  parseCandidateDirectory,
  parseCandidateProfile,
} from "../app/lib/evidence/candidate-html.ts";
import { parseFeed } from "../app/lib/evidence/feed.ts";
import { sha256Hex, stableJson } from "../app/lib/evidence/integrity.ts";

test("candidate directory cards retain constituency and portrait provenance", () => {
  const entries = parseCandidateDirectory(
    `<p><a href="/election-2026/election-constituencies/douglas-south-20211/">
       <strong>Douglas South</strong></a></p>
     <ul><li><a class="gm-sec-title" href="/election-2026/election-candidates/claire-christian/">
       <img class="gm-sec-img" src="https://mmo.aiircdn.com/61/claire.jpg" alt="">
       <p class="gm-sec-description">Claire Christian</p></a></li></ul>`,
    "https://www.manxradio.com/election-2026/election-candidates/",
  );

  assert.deepEqual(entries, [
    {
      constituencyName: "Douglas South",
      name: "Claire Christian",
      portraitUrl: "https://mmo.aiircdn.com/61/claire.jpg",
      profileUrl:
        "https://www.manxradio.com/election-2026/election-candidates/claire-christian/",
      slug: "claire-christian",
    },
  ]);
});

test("candidate profile parser scopes links and classifies rights-gated media", () => {
  const profile = parseCandidateProfile(
    `<head>
       <meta property="og:image:url" content="https://mmo.aiircdn.com/61/claire-card.jpg">
       <meta property="og:image:width" content="800">
       <meta property="og:image:height" content="600">
       <meta property="og:image:type" content="image/jpeg">
     </head><body>
       <a href="https://www.facebook.com/ManxRadio/">Publisher Facebook</a>
       <div class="s-page"><h1 class="o-headline">Claire Christian</h1>
       <p><img src="https://mmo.aiircdn.com/61/claire-body.jpg"></p>
       <p><strong>Claire Christian</strong></p>
       <p>Claire is standing as an independent candidate in Douglas South.</p>
       <a href="https://candidate.example.im/biography-link">Unverified biography link</a>
       <p><strong>Contact Details:</strong></p>
       <p>E: <a href="mailto:Candidate@Example.im">Candidate@Example.im</a></p>
       <p>P: (07624) 209800</p>
       <p><a href="https://www.facebook.com/candidate">Facebook</a></p>
       <p><a href="https://www.manxradio.com/election-2026/election-info/">Publisher explainer</a></p>
       <p><strong>Candidate Media:</strong></p>
       <p><a href="https://mmo.aiircdn.com/61/manifesto.docx">Manifesto</a></p>
       <iframe src="https://www.youtube.com/embed/example"></iframe>
       <iframe src="https://player.captivate.fm/show/example"></iframe>
       <iframe src="https://player.example.com/embed/unverified"></iframe>
       <div class="o-content-block">advert</div></div>
     </body>`,
    "https://www.manxradio.com/election-2026/election-candidates/claire-christian/",
  );

  assert.equal(profile.name, "Claire Christian");
  assert.deepEqual(profile.biographyParagraphs, [
    "Claire is standing as an independent candidate in Douglas South.",
  ]);
  assert.equal(profile.links.some((link) => link.url === "mailto:candidate@example.im"), true);
  assert.equal(profile.links.some((link) => link.url === "tel:07624209800"), true);
  assert.equal(
    profile.links.some((link) => link.url === "https://www.facebook.com/candidate"),
    true,
  );
  assert.equal(
    profile.links.some((link) => link.url === "https://www.facebook.com/ManxRadio/"),
    false,
  );
  assert.equal(
    profile.links.some((link) => link.url === "https://candidate.example.im/biography-link"),
    false,
  );
  assert.equal(
    profile.links.some(
      (link) => link.url === "https://www.manxradio.com/election-2026/election-info/",
    ),
    false,
  );
  assert.equal(
    profile.links.some((link) => link.url === "https://player.example.com/embed/unverified"),
    false,
  );
  assert.equal(profile.links.some((link) => link.kind === "interview-video"), true);
  assert.equal(profile.links.some((link) => link.kind === "interview-audio"), true);
  assert.deepEqual(profile.documents, [
    {
      kind: "manifesto",
      title: "Manifesto",
      url: "https://mmo.aiircdn.com/61/manifesto.docx",
    },
  ]);
  assert.equal(profile.portraits.length, 2);
});

test("candidate profile identity rejects stale or redirected publisher pages", () => {
  const expected = {
    expectedName: "Andrea Krüger",
    expectedSlug: "andrea-kruger",
    expectedUrl: "https://www.manxradio.com/election-2026/election-candidates/andrea-kruger/",
  };
  assert.equal(
    candidateProfileMatchesExpectedIdentity({
      ...expected,
      observedName: "Andrea Kruger",
      resolvedUrl: expected.expectedUrl,
    }),
    true,
  );
  assert.equal(
    candidateProfileMatchesExpectedIdentity({
      ...expected,
      observedName: "Another Candidate",
      resolvedUrl: expected.expectedUrl,
    }),
    false,
  );
  assert.equal(
    candidateProfileMatchesExpectedIdentity({
      ...expected,
      observedName: "Andrea Kruger",
      resolvedUrl:
        "https://www.manxradio.com/election-2026/election-candidates/another-candidate/",
    }),
    false,
  );
});

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
  const payload = stableJson({ z: [3, { b: true, a: null }], a: "The People's Isle" });
  assert.equal(payload, "{\"a\":\"The People's Isle\",\"z\":[3,{\"a\":null,\"b\":true}]}");
  assert.equal(
    await sha256Hex(payload),
    "0002c454dbe710b7f7a95a7a91f68983ea8b50f1a45ec539e6e76fd2d9ccc9dc",
  );
  assert.throws(() => stableJson({ invalid: undefined }), /finite JSON values/);
});
