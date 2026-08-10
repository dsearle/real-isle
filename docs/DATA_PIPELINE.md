# Evidence ingestion and audit pipeline

The People's Isle treats collected material as evidence, not publishable copy. The
collector may discover and classify a source item automatically, but that item
remains private until an authorised editor reviews it. Published candidate
positions and summaries must link to their supporting source records.

## Data flow

1. A fixed source catalogue defines the feed URL, exact HTTPS host allowlist,
   source tier, polling interval and rights policy for each publisher.
2. The collector acquires a short D1 lease, uses conditional HTTP requests, and
   enforces redirect, content-type, response-size and item-count limits.
3. Feed bytes are hashed and retained under a content-addressed key in the
   private `SNAPSHOTS` R2 bucket. Current publisher feeds are configured not to
   fetch or republish full article, audio or video content.
4. Normalised source items, immutable item versions, entity/topic matches,
   ingestion runs, editorial state and disputes are recorded in the `DB` D1
   database.
5. Every material change appends a hash-linked audit event. Immutable database
   triggers, installed idempotently by the evidence service after schema setup,
   protect source captures, versions, decisions and revisions from being
   rewritten in place.
6. New records enter the admin review inbox. Only an explicit review decision
   can make derived civic information public; later corrections create a new
   revision rather than erasing history.

The initial catalogue monitors Manx Radio election and Island feeds, Manx
Newscast, BBC Isle of Man, Isle of Man Today, Manx Radio and Isle of Man
Government YouTube feeds, and Tynwald Hansard. A source should not be activated
until its machine-readable endpoint, host allowlist and reuse rights have been
verified.

## Candidate registry and portraits

The Manx Radio 2026 candidate directory is monitored as a structured HTML
source. Each pull records the live set of prospective candidates, their stated
constituency, profile URL and directory portrait URL in an immutable candidate
observation. The directory is not the official nomination register: every new
candidacy remains `prospective` and `unverified` until an editor can cite an
official nomination source.

Candidate profile pages are backfilled gradually. The connector observes the
publisher's eight-second crawl delay through a persisted host-wide request
lease, so overlapping feed and profile jobs cannot bypass it. The connector
processes one due profile per run. It
extracts source text, public contact links, websites and social accounts,
embedded interview links, transcript/manifesto document references, and body/OG
portrait variants. These are private research records until reviewed; text is
not converted into a public position or claim automatically.

Portrait discovery is deliberately metadata-only. For each image the registry
stores its remote URL, source page, source snapshot, variant, dimensions when
published, observation time, and a rights state. A public image is not assumed
to be reusable: the default is `rights_state = unknown`, no image bytes are
copied to R2, and publication is blocked by a database constraint. A portrait
can only be published from The People's Isle storage after review records either
candidate permission or a redistributable licence. The initials artwork remains
the public fallback.

A complete directory observation also reconciles absence. A candidate no
longer listed by the source is marked source-removed, withheld from current
counts, and no longer crawled; the historical observations remain intact. A
later reappearance restores prospective status. Removed profile links and
documents are withheld, and any source change to an approved profile or child
record moves it to `needs-update` without rewriting the reviewed fields.

Facebook and other social URLs may be discovered from candidate profile pages.
The collector does not crawl those platforms; their content requires a separate
authorised integration and editorial review.

## Interview and transcript pipeline

Candidate profile parsing creates durable transcript jobs when it discovers a
publisher transcript document, a specific YouTube interview, or a podcast/audio
interview. Discovery is not treated as permission to copy or publish the
material. Each job keeps independent access, rights, retention and processing
states so that, for example, a publicly linked transcript can be retrievable but
still lack a republication licence.

The transcript structure is deliberately layered:

1. `transcript_jobs` records the candidate, exact source observation and
   snapshot, provider URL/ID, access decision, rights state, attempts, leases,
   errors and processor state.
2. `transcripts` records an immutable derived artefact in R2, its source
   snapshot, content/configuration hashes, producer/model version, quality,
   rights, review state and publication state. An editor correction or model
   rerun creates a new transcript rather than rewriting the earlier wording.
3. `transcript_segments` records ordered, time-aligned text, speaker labels,
   offsets, confidence and per-segment hashes. A proposed claim can therefore
   cite the exact seconds and wording that support it.
4. `claims` and `evidence` remain private proposals until an editor checks the
   transcript segment against the original media and records a review event.

The preferred acquisition order is publisher-provided transcript, candidate or
publisher upload, owner-authorised captions, then ASR of media for which explicit
processing permission or a reusable licence has been recorded. Publisher DOCX,
PDF, VTT or SRT files are fetched only by a dedicated bounded connector with
strict MIME/magic, size, redirect and archive-expansion checks. Original bytes
and normalised output receive separate content hashes and private R2 keys.

YouTube does not expose arbitrary public transcript text through the supported
Data API. [`captions.list`](https://developers.google.com/youtube/v3/docs/captions/list)
returns track metadata rather than text, while
[`captions.download`](https://developers.google.com/youtube/v3/docs/captions/download)
requires OAuth from an authenticated account with permission to edit the
relevant video. Caption data acquired through OAuth is private, expiring
editorial input; it is not itself a publicly reusable transcript. A public
transcript must instead be supplied separately by the publisher or rights
holder under an explicit reuse basis. The
[YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
also prohibit undocumented scraping and separating or downloading audiovisual
components outside the permitted API flow.
The People's Isle therefore does not use player scraping, undocumented timed
text endpoints, `yt-dlp`, or YouTube audio extraction. Until a channel owner
authorises private caption access or supplies a transcript, a discovered YouTube item is
shown in the private workspace as `permission-required`; the official player
and source link remain the public reference.

Full transcript publication is also separate from acquisition. It requires an
approved review, a stored-publishable artefact, and candidate/publisher
permission or a redistributable licence. Without that basis the public site may
show only reviewed factual summaries, limited evidence excerpts where lawful,
timestamps, hashes and the original source link.

## Storage and integrity

- **D1 (`DB`)** holds structured civic entities, source metadata, observations,
  immutable versions, transcript jobs and segment metadata, claims, evidence
  links, reviews, disputes and the audit chain head.
- **R2 (`SNAPSHOTS`)** holds private, content-addressed source captures. Access
  and retention are rights-gated; a stored capture is not permission to publish
  the publisher's text, audio or video.
- **Audit chain** links canonical event payload hashes to the previous event.
  This makes undocumented alteration evident while keeping the complete review
  history available for challenge and correction.
- **Future Sui anchoring** will periodically commit only an audit-root hash and
  minimal timestamp/batch metadata. Source content, candidate documents, user
  data and other personal information must never be put on-chain.

Automated matching is currently deterministic and records its method and
confidence. Future AI extraction must follow the same rule: model output is a
private proposal with cited evidence, model/method metadata and an editorial
review state, never an automatically published fact.

## How collection runs

Normal GET traffic wakes a bounded background check for due sources. Leases,
idempotency keys, ETags/Last-Modified headers and failure backoff make repeated
or overlapping calls safe. The public health summary is available at
`/api/evidence/status`, while the detailed review inbox is at `/admin/review`.
That founder route requires ChatGPT sign-in and a server-side match against the
Site-specific IDs in `ADMIN_USER_IDS` or founder emails in `ADMIN_EMAILS`; an
authenticated user who is not on either allowlist sees only their own setup
identifier and no unpublished evidence. IDs are preferred as collaborators are
added; the initial owner email is a bootstrap identity for the private Site.

For regular checks even when the private site has no visitors,
`.github/workflows/evidence-ingestion.yml` runs every ten minutes. It is
deliberately dormant until all three repository secrets are configured:

- `REAL_ISLE_INGEST_URL` — the full deployed URL ending in
  `/api/internal/ingestion/run`;
- `REAL_ISLE_INGESTION_SECRET` — the inner application bearer secret, matching
  the deployed `INGESTION_SECRET` runtime variable; and
- `REAL_ISLE_SITES_BYPASS_TOKEN` — a machine token for the outer private Sites
  sign-in gate.

If any secret is absent, the workflow exits successfully and emits a notice; it
does not make a partial or unauthenticated request. When active, each request
uses both independent bearer headers plus a unique `Idempotency-Key`. The Sites
bypass token must be explicitly generated and should be rotated if exposed.

## Adding or changing a source

1. Verify the canonical machine-readable endpoint and publisher ownership.
2. Record an exact HTTPS host allowlist; do not accept user-supplied fetch URLs.
3. Classify the source tier and rights state. Default to metadata-only and
   `storeFullContent: false` unless reuse and retention rights are documented.
4. Choose a respectful polling interval and test redirects, conditional requests
   and parser behaviour against bounded fixtures.
5. Keep all newly ingested records private, then review the source and a sample
   of matches in `/admin/review` before relying on them in public comparisons.

Schema changes belong in `db/schema.ts`; generate migrations with
`npm run db:generate`, inspect the SQL, and apply them to the isolated local
bindings with `npm run db:migrate:local` before running the normal type, lint
and test checks. Local state under `.wrangler/` never targets the deployed D1
database or R2 bucket.
