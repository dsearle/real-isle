# Real Isle — Isle of Man Civic Intelligence Platform

**Document status:** Consolidated build brief and product specification

**Prepared:** 8 August 2026; consolidated 9 August 2026

**Target election:** House of Keys General Election, 24 September 2026

**Product name:** **Real Isle**
**First meaningful public release target:** 16 August 2026

## 1. Executive summary

Real Isle will be an independent, non-partisan, open-source civic intelligence platform that helps Isle of Man residents understand who is seeking to represent them, what each person has said, where their evidence comes from, and how positions compare on the issues that matter locally.

The public experience will begin with the Island itself: a visually distinctive, mobile-first map of the 12 constituencies, supported by authentic Island imagery and candidate portraits. A visitor can select where they live, meet the prospective or nominated candidates, compare their stated positions, inspect the underlying manifesto, interview, public record, or news source, and privately compare their own views through a local-only vote compass.

The intelligence system will monitor approved public sources, discover new election material, transcribe permitted audio and video, identify candidate and topic references, and propose evidence-backed summaries. Automation assists the editors; it does not make final political judgements. Candidate positions, potentially damaging claims, identity matches, and substantive AI summaries require human review before publication.

The 2026 election is the first release, not the end of the product. After polling day, Real Isle will transition into a five-year accountability service that connects elected representatives to their prior manifestos, commitments, Tynwald activity, public statements, government responsibilities, and evidenced delivery status.

The defining promise is:

> **Every important claim should be understandable in seconds and verifiable in one click.**

The hub must not imply that it is the official election authority, reproduce publishers' work without permission, turn absence of evidence into a political position, or describe an anonymous opt-in pulse as a representative opinion poll.

### Confirmed product decisions — 9 August 2026

- Ship a meaningful public release by approximately **16 August 2026**.
- Launch-critical scope: map, all constituencies, candidate profiles, continuous news monitoring, manifesto ingestion and comparison, initial interview transcription, evidence drawers, admin review, and a privacy-preserving vote compass.
- Phase II: interactive political-system explainer, evidence-grounded AI question-answering, and any public vote-intention pulse.
- The vote compass runs locally in the visitor's browser and does not send political answers to the server by default.
- Candidate and issue intelligence is continuously updated, but political interpretation never auto-publishes.
- One authenticated owner/admin begins the review process; additional reviewers can be invited later through role-based access.
- Candidate profile claims are manually verified by the owner initially.
- Existing MHK manifestos and evidenced delivery history are in scope because they materially strengthen the platform.
- Real Isle is intended to be fully open source, subject to separating redistributable public data from private, restricted, personal, or copyrighted research material.
- Founder and initial publisher/editor: **David Searle**, using his real name with transparent founder-operated disclosure.
- Preferred public domain: **realisle.im**.
- Public source repository target: David Searle's personal GitHub account, `dsearle/real-isle`.
- Initial code licence: **Apache License 2.0**; data and media retain separate per-record rights/licensing.
- Initial source allowlist: official election and Tynwald sources, Manx Radio, Isle of Man Today, BBC Isle of Man, Energy FM/Manx.News, 3FM, registered parties, verified candidate sites/accounts, and their manually verified associated YouTube channels.
- Vercel is the provisional hosting target. Git, versioned database migrations, isolated previews, and controlled promotion protect continuous Codex development from overwriting curated or production state.
- Cryptographic transparency is a product requirement. A conventional signed transparency log is the Phase I baseline; **Sui is the selected network for all blockchain architecture**, checkpoint anchoring and any future on-chain ZK/nullifier design.

## 2. Current election context

The specification is grounded in the following facts as at 8 August 2026:

- The election is due on **Thursday 24 September 2026**, with voting from 8am to 8pm.
- The Island has **12 constituencies**, each electing **two members** to the 24-member House of Keys.
- The House of Keys is dissolved on **13 August 2026**.
- Nominations run from 19 August and close at **1pm on 26 August 2026**. Before the official notice of poll, people should normally be labelled *declared* or *prospective*, not *officially nominated*.
- Manx Radio plans 12 constituency programmes between **31 August and 17 September**, with video streams on YouTube. These are a high-priority transcription and evidence source, subject to permission and platform terms.
- Candidate manifestos and relevant-interest declarations are expected to become available through official election channels as the campaign progresses.

Authoritative context and discovery sources:

- [Isle of Man Government: House of Keys General Election 2026](https://elections.gov.im/house-of-keys-general-election-2026/)
- [Manx Radio Election 2026 hub](https://www.manxradio.com/election-2026/)
- [Manx Radio candidate index](https://www.manxradio.com/election-2026/election-candidates/)
- [2021 CPA BIMR Election Observation Mission final report](https://consult.gov.im/cabinet-office/the-work-of-the-electoral-commission/supporting_documents/CPA%20BIMR%20Election%20Observation%20Mission%20toisleofman2021_compressed.pdf)

The official election website remains the authority for nomination status, voting instructions, deadlines, polling places, and results. The intelligence hub will link to it and clearly identify any discrepancy.

## 3. Product goals

### 3.1 Primary goals

1. Give a resident a reliable overview of their local field in under two minutes.
2. Make candidate positions on major issues comparable without flattening nuance.
3. Let every summary be traced to dated, contextual evidence.
4. Surface new candidate declarations, manifestos, interviews, policy changes, and missing information quickly.
5. Offer candidates a fair, documented route to supply information and request corrections.
6. Give editors an efficient control room for discovery, review, publication, corrections, source health, and coverage balance.
7. Create a durable public archive of the campaign after polling day.
8. Show returning candidates' prior manifestos, commitments, offices, election results, and evidenced record without reducing complex delivery to a simplistic score.
9. Transition elected candidate profiles into five-year representative and commitment trackers.
10. Make published revisions and editorial decisions independently auditable through signed, verifiable history.

### 3.2 Non-goals

The first release will not:

- recommend whom someone should vote for;
- assign an overall quality, truthfulness, ideology, or electability score to a candidate;
- claim to predict the election;
- infer a position from silence, demographic characteristics, party association alone, or another person's statement;
- provide an official online ballot, voter registration, or polling-place service;
- ingest private groups, private messages, paywalled content without a licence, or material obtained by bypassing access controls;
- present AI-generated or altered candidate imagery as documentary photography, or use synthetic political imagery that mocks, favours, sexualises, ages, beautifies, caricatures, or otherwise changes the apparent character of a person;
- allow unmoderated public comments on candidate pages;
- promise one-person-one-response while also claiming to identify no one;
- place source content, candidate data, visitor political preferences, personal data, or admin identities directly on a public blockchain;
- assume that an image is reusable merely because it is publicly visible online.

## 4. Product principles

### Evidence before interpretation

Every position contains at least one evidence item. Evidence shows source, publisher, publication date, relevant excerpt, context, and timestamp/page number where available. Summaries distinguish direct quotation, faithful paraphrase, editorial synthesis, and inference.

### Candidate status is precise

The data model and user interface distinguish:

- declared/prospective;
- nomination pending verification;
- officially nominated;
- withdrawn;
- elected;
- not elected.

Only the official notice of poll can promote a profile to *officially nominated*.

### Neutrality is a process

Fairness is supported by a written methodology, shared question set, candidate right of reply, balanced discovery rules, coverage-gap alerts, audit history, and visible corrections—not by pretending that all candidates have generated equal quantities of evidence.

### Absence is explicit

Use **“No published position found as of [date]”** when research is incomplete or the candidate has not addressed a topic. Never translate it into *neutral*, *opposed*, or *supportive*.

### Recency is visible

An older position remains available, but a visitor can see when it was stated, whether it was superseded, and how the position changed.

### Privacy by design

No account is required for the public experience. The vote compass asks for no name, email, exact address, full postcode, electoral-register detail, or demographic profile and keeps political answers on the visitor's device by default.

The launch vote compass performs weighting and candidate comparison locally in the browser. Answers are not submitted to Real Isle by default. A future share feature must encode the minimum necessary result and require an explicit visitor action.

### Auditable by construction

Every published assertion, evidence link, AI suggestion, human edit, approval, dispute, correction, and supersession creates a versioned event. Public revisions can be verified against signed transparency checkpoints. Auditability does not mean publishing private contact data, restricted archives, security signals, or legally removed content.

### Accessibility is part of correctness

Map-based exploration always has a list and search alternative. Portraits, charts, audio, video, and colour-coded stances have equivalent text. The target is WCAG 2.2 AA.

## 5. Audiences and core jobs

| Audience | Need | Product response |
|---|---|---|
| Resident who knows their constituency | Quickly understand the local field | Constituency overview, candidate cards, key differences, comparison |
| Resident who does not know their constituency | Find the right local information without surrendering personal details | Map/list browsing and a link to the official government constituency finder; do not collect a full postcode in the hub |
| Issue-led voter | Understand what candidates have said about Manx Care, energy, housing, or another issue | Topic page and evidence-backed position matrix |
| Detail-oriented voter | Read the original material and assess context | Source pages, transcript timestamps, manifestos, change history |
| Young or first-time voter | Understand the process without jargon | Plain-language election guide and “how to use this site” prompts |
| Candidate or campaign | Confirm links, supply material, or challenge an error | Structured submission and correction route with receipt and audit trail |
| Editor/reviewer | Turn a fast-moving campaign into trustworthy structured information | Review queues, source health, candidate gap alerts, coverage dashboard |
| Site administrator | Keep the platform secure, available, and legally defensible | Role controls, audit logs, incident controls, poll monitoring, provenance reports |

## 6. Information architecture

### Public navigation

1. **Home / Explore the Island**
2. **Constituencies**
3. **Candidates**
4. **Issues**
5. **Compare**
6. **Latest intelligence**
7. **Vote compass**
8. **Election guide**
9. **Accountability and political history**
10. **Methodology, sources, corrections, ownership, and audit verification**

### Administrative navigation

1. **Today** — priority alerts and freshness overview
2. **Review queue** — evidence, summaries, positions, transcripts, identity matches
3. **Candidates and constituencies**
4. **Issues and comparisons**
5. **Sources and monitors**
6. **Suggestions**
7. **Compass methodology; Phase II pulse integrity**
8. **Corrections and submissions**
9. **Publication calendar**
10. **Users, roles, audit, and system health**
11. **Transparency checkpoints and disputes**

## 7. Public experience specification

### 7.1 Home: Explore the Island

The opening view should feel recognisably Manx before it feels like a database.

Required components:

- A strong editorial headline and election countdown.
- An accessible SVG map of all 12 constituencies over restrained topographic/coastal visual treatment.
- A text list/search alternative presented alongside the map on small screens.
- Tap/hover constituency preview with seat count, status, candidate portraits, new-content count, and top local issues.
- “Choose where you live” selector stored locally so later views prioritise that constituency.
- A ribbon of the latest verified developments.
- “What changed today?” summary.
- Major issue cards, initially including health and Manx Care, energy and proposed wind development, government effectiveness/public finances, housing/cost of living, and any topics promoted by live editorial evidence.
- Clear links to the official election website for registration, postal/proxy deadlines, constituency lookup, and polling information.
- Persistent explanation that the site is independent and evidence-led.

Visual direction:

- Palette inspired by sea, slate, gorse, and Manx red, tested for accessible contrast.
- Licensed Island photography with an image-rights record; never decorative imagery that makes a candidate appear associated with an issue or location without basis.
- Candidate portraits use a consistent crop and neutral frame. A named fallback avatar is used when no licensed photo is available.
- Portrait grids are a primary navigation mechanism, not just decoration.
- A progressively enhanced 2.5D/3D Island treatment may create the launch “wow” moment, but official constituency geometry remains the geographic source and a fast 2D SVG/list remains the accessible, low-power and low-bandwidth baseline.
- Neutral AI-assisted illustrated character treatments may supplement real portraits only after the source image's reuse/derivation rights are documented. They use one consistent art direction and crop, are visibly labelled as illustrations, receive human review, and never replace documentary images in evidence contexts.
- Image generation must not add clothing, symbols, settings, facial expressions, apparent age, body changes, or implied associations that could influence political perception.
- Avoid party-style red/blue coding because most Manx candidates historically stand as independents and imported colour conventions could imply alignment.

### 7.2 Constituency page

Route: `/constituencies/{slug}`

Required content:

- Name, map outline, two-seat explanation, and official status timestamp.
- All declared or officially nominated people, with status badges and equally sized cards.
- Sort defaults to randomised or rotating display per session; alphabetical sort is available. Editorial ranking is prohibited.
- Candidate card: portrait, name, status, party/independent label if verified, short self-description if supplied, freshness, and evidence completeness.
- “Compare candidates” action, supporting all candidates but encouraging two to four on small screens.
- Local issue summary and candidate position matrix.
- Latest constituency-specific coverage and event/debate schedule.
- A local-only vote-compass entry point using reviewed positions. Phase II pulse results appear only if the separate legal, privacy and integrity gate is later approved.
- Official boundary/polling-information link.

### 7.3 Candidate profile

Route: `/candidates/{slug}`

Required sections:

1. **Identity header** — portrait, full name, constituency, candidacy status, verified party/independent status, last checked time.
2. **At a glance** — candidate-supplied biography clearly labelled, three to five evidenced priorities, and information-completeness status.
3. **Where they stand** — topic cards using the controlled stance language below.
4. **In their own words** — short permitted excerpts with direct links/timestamps; avoid building a substitute for the source publication.
5. **Manifesto and official documents** — original links, captured metadata, checksum/version, published date, and supersession status.
6. **Interviews and appearances** — audio/video players or outbound links as permissions allow, searchable transcript, speaker confidence, and timestamps.
7. **Recent coverage** — deduplicated chronological items with source labels.
8. **Public record and prior commitments** — for incumbents/returning candidates, prior election results, previous manifestos and commitments, verified Tynwald membership, votes, questions, speeches, roles, and evidenced delivery status; present context rather than a crude activity score.
9. **Official online presence** — verified website and social profiles with “candidate confirmed,” “editor verified,” or “unverified lead” status. Unverified leads remain admin-only.
10. **Position history** — additions, clarifications, and changes with dates and evidence.
11. **Corrections and right of reply** — visible route to submit a correction and public correction log.
12. **Profile ownership** — a candidate can request to claim a profile. The owner manually verifies the claim initially. Claiming enables submissions, clarifications and dispute tracking but never silent editing or deletion of history.
13. **Public campaign contact** — shown only when explicitly published or supplied for campaign/public use and verified as appropriate; never infer or republish personal contact details merely because they can be discovered.

Candidate profile rules:

- No popularity ranking based on page views, media mentions, social followers, or content volume.
- No personality, trustworthiness, or sentiment score.
- No automated allegation, scandal, or controversy section.
- Materially adverse claims require elevated editorial review and a right-of-reply workflow.
- Candidate previews or invitations may be sent when operationally practical, but publication of verified public evidence does not require candidate approval and a candidate cannot veto fair, lawful historical records.

### 7.4 Topic page

Route: `/issues/{slug}`

Each topic page contains:

- A neutral 100–200 word explainer with authoritative background sources.
- Why the issue is being discussed now.
- Specific sub-questions; for example, a generic *energy* label is too broad to represent positions on an onshore project, an offshore project, ownership, price guarantees, grid resilience, and climate targets.
- Candidate position matrix, filterable by constituency.
- Evidence count and most recent evidence date, never converted to an overall candidate score.
- Areas of agreement, disagreement, conditional support, and unanswered questions generated from reviewed position data.
- Timeline of important proposals, candidate statements, and official decisions.
- Related source material and corrections.

Initial controlled topic taxonomy:

| Topic | Example sub-questions |
|---|---|
| Health and Manx Care | Funding, governance, waiting times, workforce, primary care, mental health, off-Island treatment |
| Energy and wind development | Onshore/offshore scope, ownership, price impact, environmental impact, community benefit, planning, energy security |
| Housing and cost of living | First-time buyers, rental supply, planning, social housing, utilities, food and fuel costs |
| Government and public finances | Size/effectiveness of government, taxation, reserves, capital spending, transparency, digital services |
| Economy and employment | Diversification, finance/e-gaming, small business, productivity, skills, population strategy |
| Transport and infrastructure | Roads, buses, airport, ferry services, ports, active travel, telecoms |
| Education, children, and childcare | Funding, attainment, SEND, apprenticeships, childcare, youth services |
| Social care and carers | Residential care, at-home support, unpaid carers, disability services, ageing population |
| Environment and planning | Biodiversity, waste, emissions, land use, marine policy, planning reform |
| Justice, safety, and rights | Policing, sentencing, drugs policy, equality, civil liberties, online harms |
| Democracy and public trust | Ministerial accountability, FOI, local government, electoral reform, public consultation |
| Culture, communities, and Manx identity | Language, heritage, sport, arts, regional balance, community facilities |

Editors may split or merge topics as evidence develops. Topic changes are versioned so historical statements do not silently move context.

### 7.5 Compare experience

Route: `/compare?constituency={slug}&candidates={ids}`

Comparison must be shareable and readable without horizontal scrolling on mobile.

- Portrait/name headers use equal dimensions and no preferred placement.
- Rows are topic questions, not vague issue names.
- Each cell displays reviewed stance, concise summary, evidence count, most recent date, and source link.
- “No published position found” is visually distinct from “unclear/mixed.”
- Users can expand context without leaving the comparison.
- Default topics are selected by public relevance and editorial taxonomy, not by which topics create the greatest contrast.
- A print-friendly view supports offline discussion.

### 7.6 Latest intelligence

Route: `/latest`

This is the campaign's chronological newsroom:

- A **Just in** stream of newly discovered headlines from explicitly allowlisted publishers.
- A separate **Verified intelligence** stream for reviewed summaries, candidate positions, manifesto changes, and corrections.
- New declarations and official nomination changes.
- New manifestos and document revisions.
- Newly reviewed positions.
- Interviews, debates, articles, and candidate posts from approved official accounts.
- Corrections and meaningful position changes.
- Filters for constituency, candidate, topic, source, and content type.
- Every item distinguishes **source published time**, **system discovered time**, and **editor verified time**.
- New items appear without a full page refresh. The browser receives a lightweight update signal and fetches the new cards; it does not repeatedly download the whole feed.
- A visitor can pause live updates, return to the item they were reading, and activate a “new updates available” control. New cards must not unexpectedly move the page under the reader.
- Candidate and constituency pages show a compact “Latest about this candidate/area” module using the same canonical news records.
- If a monitored source is delayed or unavailable, the site shows the last successful check to editors and never presents old material as newly published.

“Real-time” means:

- approved feeds checked approximately every 10–15 minutes during the campaign;
- a target of less than 15 minutes from source availability to discovery for healthy feeds;
- source items may appear quickly with basic metadata;
- political summaries and position updates appear only after review;
- only headline, publisher, original link, publication time, thumbnail where licensed, and basic non-interpretive metadata from explicitly allowlisted sources may be automatically exposed in **Just in**;
- a future Phase II pulse, if approved, has its own refresh and integrity rules and is not part of the launch feed.

### 7.7 Election guide

Provide a plain-language guide for first-time and returning voters. It must link to, not replace, official guidance. Include election date, age/registration basics, postal/proxy links, the two-seat structure, accessibility links, and the official constituency/polling-station finder. Display a “checked against official source” date.

### 7.8 Methodology and transparency

The methodology is a top-level product feature, not footer small print. Publish:

- who owns, funds, edits, and advises the site;
- conflicts-of-interest policy;
- source inclusion and exclusion rules;
- position and summary methodology;
- AI use and human review policy;
- candidate-contact and right-of-reply policy;
- corrections log;
- image and content-rights policy;
- vote-compass questions, scoring, dataset versions and privacy behaviour;
- Phase II pulse methodology, limitations, response counts, integrity interventions, and close date if that feature is ever enabled;
- change log for material methodology revisions.

### 7.9 Accountability, sharing and Phase II learning

Returning-candidate and incumbent views extend beyond the campaign: prior elections, manifestos, commitment evidence and office history use the same source drawers and revision system as current positions. After election night, elected cards transition into a visual House of Keys representation and then into representative/accountability profiles; unsuccessful candidacies remain in the permanent election archive.

Real Isle should generate accessible, high-quality share cards/pages for constituencies, candidate introductions, evidenced issue comparisons, manifesto changes, political-system explainers and official results. Share text must avoid endorsement, popularity language and decontextualised AI conclusions. Every shareable conclusion resolves to a stable public revision with evidence.

Phase II adds:

- visual progressive-disclosure explainers for Tynwald, House of Keys, Legislative Council, MHK/MLC roles, Chief Minister selection, Council of Ministers, legislation, budgets, committees and scrutiny;
- **Ask Real Isle**, a retrieval interface that answers only from approved evidence, cites each substantive political answer, exposes uncertainty, and prefers “not enough reliable evidence” to completion from general model knowledge;
- optional learning mechanics such as constituency/history quizzes or exploration progress, rewarding understanding rather than candidate loyalty;
- richer election-night map/card transitions and the interactive House of Keys.

## 8. Position and evidence model

### 8.1 Permitted public labels

Stance labels apply to a precise proposition, not a whole topic:

- **Supports**
- **Opposes**
- **Supports with conditions**
- **Mixed or evolving**
- **Unclear from available evidence**
- **No published position found**

Each position record includes:

- candidate;
- topic and precise proposition;
- label;
- one-sentence neutral summary;
- evidence items;
- earliest and latest supporting dates;
- whether it is direct, paraphrased, or editorially synthesised;
- extraction confidence, visible to editors but not presented as candidate certainty;
- review status, reviewer, and review time;
- superseded/version history;
- candidate response or correction status.

Manifestos are not treated as undifferentiated prose. The extractor preserves the original document and classifies each candidate-authored item without strengthening its language:

- **Commitment** — explicit intended action, such as “I will…”
- **Objective** — desired outcome, such as “I want to…”
- **Support** — stated support for a proposal or principle
- **Opposition** — stated opposition to a proposal or principle
- **Exploration** — promise to investigate, consult, review, or consider
- **Observation/diagnosis** — description of a problem without a promised action
- **Unclear** — evidence is insufficient to classify safely

For returning candidates, a prior commitment may receive one reviewed accountability status: **not started**, **evidence of activity**, **in progress**, **delivered**, **partially delivered**, **changed/superseded**, **blocked or outside individual control**, or **insufficient evidence**. Status, attribution limits and evidence are shown together. Real Isle never rolls these into a simplistic percentage or league table.

### 8.2 Evidence hierarchy

Evidence type is shown rather than collapsed into a secret numerical score:

1. Officially filed manifesto or declaration.
2. Candidate's verified website, document, or official social account.
3. Direct interview, debate, speech, or candidate answer.
4. Official public record, including Tynwald material for incumbents.
5. Reputable newsroom report quoting or accurately paraphrasing the candidate.
6. Third-party claim, which normally cannot establish a position without corroboration.

### 8.3 Editorial decision rules

- Preserve conditions and scope. “Supports renewable energy but opposes Project X at Location Y” is not simply “opposes wind power.”
- A party manifesto does not automatically become an individual candidate's position unless the candidate/party relationship and adoption are evidenced.
- AI must not convert “consider,” “explore,” “seek,” “support,” or “aim” into “will deliver.”
- Older evidence remains visible when superseded.
- Similar reports derived from one original statement count as one underlying evidence event.
- The system must expose conflicting evidence to an editor rather than choose the newest item automatically.
- Quotes should be short, necessary, contextual, and compliant with licence/copyright requirements.

## 9. Source monitoring and intelligence pipeline

### 9.1 Initial source register

The source register is configurable; inclusion is an editorial decision. Initial discovery candidates include:

- Isle of Man Government elections pages and constituency pages;
- Tynwald member pages, Hansard, questions, votes, committee material, and official documents;
- Manx Radio election pages, news, programmes, podcasts, and permitted video/captions;
- Isle of Man Today and its election/newspaper coverage;
- BBC Isle of Man coverage;
- Energy FM and Manx.News;
- 3FM;
- other established local publications selected under the source policy;
- registered political-party websites and documents;
- candidate-controlled sites and verified public social accounts;
- campaign events and public-meeting recordings supplied with appropriate rights.

Social-network discovery is useful but fragile. The production system should use permitted APIs, embeds, feeds, candidate submissions, or editor-supplied URLs. It must not depend on bypassing login walls, anti-bot controls, or platform terms.

### 9.2 Source record

Each monitored source contains:

- owner/publisher and contact;
- source type and editorial tier;
- base URL/feed/API/channel;
- permitted ingestion method;
- crawl schedule and rate limit;
- robots/terms/licence review date;
- content and image reuse rights;
- expected language/media types;
- parser version;
- last success, last new item, error rate, and health status;
- whether automatic publication of metadata is permitted;
- whether full text/audio may be stored, and for how long.

### 9.3 Periodic monitoring and self-update service

The update service runs continuously as a set of durable scheduled jobs. It must continue operating when no administrator is logged in and resume safely after deployment or an outage.

Recommended campaign cadence:

| Source class | Normal campaign cadence | Peak/event cadence | Publication behaviour |
|---|---:|---:|---|
| Official election status, notices, and results | 5 minutes | 30–60 seconds on nomination deadline/election night where permitted | Status changes require authoritative match; official results require dual verification |
| Approved newsroom RSS/API feeds | 5–10 minutes | 2–5 minutes during live debates/election events | Allowlisted headline metadata may enter **Just in** automatically |
| News pages without a feed | 15 minutes | 5–10 minutes when editorially justified | Discovery only until parser and rights checks pass |
| Candidate/party websites and manifesto pages | 15–30 minutes | 10 minutes around announced launches | New or changed material enters review; no automatic stance change |
| Verified public social channels through permitted APIs/feeds | 10–15 minutes | 5 minutes during scheduled events, within platform limits | Discovery only by default; exact posts may be linked/embedded where permitted |
| Tynwald/public-record sources | Hourly | 15–30 minutes when relevant material is expected | Structured extraction enters review |
| Link, redirect, image-rights, and stale-profile checks | Daily | On demand | Admin suggestions only |

Cadences are per-source configuration rather than hard-coded. The scheduler applies jitter to avoid traffic bursts, respects publisher rate limits, uses exponential backoff on errors, and automatically returns to the normal schedule after recovery. Administrators can temporarily increase or pause a source through a time-limited override recorded in the audit log.

Each check must:

1. Use RSS, API, sitemap, `ETag`, `Last-Modified`, or a saved source cursor where available to minimise unnecessary requests.
2. Acquire a per-source lock so overlapping jobs cannot create duplicates.
3. Record start time, completion time, response state, cursor, item count, change count, and parser version.
4. Calculate canonical URLs and content hashes so a changed headline, revised manifesto, updated article, or syndicated copy is recognised correctly.
5. Create an immutable discovery event before downstream enrichment begins.
6. Invalidate only the affected feed, candidate, constituency, or topic caches after an approved/public update.
7. Emit a visitor update event containing record IDs and versions, never untrusted source HTML.

Automatic publication is deliberately narrow:

- A source must be explicitly marked **trusted for headline autopublish** by an administrator.
- The parser must pass schema, URL, timestamp, source-identity, duplicate, and content-safety validation.
- Automatic cards reproduce only permitted metadata and link directly to the publisher.
- AI-generated summaries, candidate-position implications, identity decisions, accusations, sensitive claims, and article corrections never auto-publish.
- If a source changes structure, returns abnormal volume, republishes old items as new, or fails validation, autopublishing stops and an alert/suggestion is created.
- Removing an item from a feed does not silently delete the hub record; it creates a reviewable withdrawal/change event.

Source-health alerts:

- **Warning:** two consecutive failures or twice the expected freshness interval without a successful check.
- **Critical:** six consecutive failures, invalid/poisoned output, abnormal publication volume, or a priority source stale for one hour during a peak event.
- The admin dashboard shows next check, last success, last new item, lag, recent failures, and current backoff.
- Critical official/news source failures notify the on-duty editor through the configured operational channel.

### 9.4 Processing flow

```mermaid
flowchart LR
    A["Approved public sources"] --> B["Fetch and preserve metadata"]
    B --> C["Normalise and deduplicate"]
    C --> D["Transcribe or extract text where permitted"]
    D --> E["Resolve candidate, constituency, and topic"]
    E --> F["Generate evidence and summary suggestions"]
    F --> G["Human editorial review"]
    G --> H["Publish with citations and version history"]
    H --> I["Corrections, monitoring, and audit"]
```

Pipeline requirements:

1. Fetch only from approved source configurations.
2. Record canonical URL, publication time, discovery time, title, author, source, content hash, and rights policy.
3. Remove tracking parameters and identify syndication/near-duplicates.
4. Preserve the original URL and a limited internal research copy only when legally permitted.
5. Extract text from HTML/PDF and permitted documents with page references.
6. For audio/video, prefer publisher-provided transcripts/captions. Transcribe source media only when access and reuse are permitted.
7. Use speaker diarisation and candidate identity resolution. Uncertain speech remains unattributed.
8. Suggest topics, claims, and position implications with source spans/timestamps.
9. Route sensitive, conflicting, low-confidence, or adverse items to elevated review.
10. Record model/prompt/extractor versions and all human changes.
11. Publish only approved representations and invalidate affected caches.

### 9.5 Source preservation and disappearance

Internet sources can change or disappear. Each accepted evidence item therefore creates a provenance bundle at discovery time:

- canonical and requested URLs;
- publisher, author/byline where stated, publication and retrieval times;
- response headers and content type where available;
- original downloaded bytes or standards-based web archive record when acquisition and retention are lawful;
- normalised extracted text, content hash, extractor version, and page/timestamp map;
- a rendered screenshot/PDF for editor comparison where appropriate and permitted;
- later retrievals as new versions rather than overwriting the first observation;
- relationship to syndicated, corrected, redirected, withdrawn, or deleted versions.

The object store uses immutable/versioned keys and retention rules. Database records reference the content digest rather than a mutable filename. The cryptographic audit layer proves that a particular digest was relied upon at a particular publication revision.

Public availability is separate from preservation. Candidate manifestos and other clearly redistributable primary material may be exposed directly when rights permit. For third-party journalism, broadcasts, social posts, personal data, or unclear licences, Real Isle normally publishes only necessary excerpts, metadata, hashes and links; the complete research snapshot remains restricted to authorised reviewers or is not retained. A public hash does not create a right to republish copyrighted or erased material.

When a source disappears, the public record states that the original link is unavailable and when it was last observed. It may show the previously reviewed claim and permitted excerpt with its provenance, but must not automatically expose a restricted full snapshot. Valid legal, privacy and takedown requests create a tombstone/correction event rather than rewriting history invisibly.

### 9.6 Transcription standards

- Display “publisher transcript,” “machine transcript,” or “editor-corrected transcript.”
- Show confidence warnings for unclear passages and names.
- Retain timecodes and speaker labels.
- Never manufacture words to smooth a transcript.
- A low-confidence statement cannot establish a public candidate position.
- Candidate names, numbers, project names, and policy commitments receive human spot-checks.
- Provide playback at the cited moment when embedding/licensing permits; otherwise link to the source timestamp.
- Store only what the rights assessment permits and remove material promptly after a valid takedown.

### 9.7 Candidate/link discovery

The system should actively propose missing official presence without auto-publishing it. Discovery combines:

- links from official candidate/party/source pages;
- candidate-supplied links;
- exact-name plus constituency searches;
- cross-links between verified accounts;
- consistent portrait/biography/contact-domain evidence;
- repeated citations from reputable local media.

Admin suggestions include evidence and a confidence band. A human must confirm identity and public relevance. Similar names, parody accounts, inactive legacy campaigns, personal profiles, and unofficial supporter pages are common failure modes.

### 9.8 Facebook and YouTube integration policy

Facebook is likely to contain important candidate material, but it is not a dependable open-news feed. Real Isle must not build its evidence pipeline around logged-in scraping, browser-session automation, private groups, personal-friend access, or attempts to evade Meta controls. “Public on Facebook” does not automatically mean available through a supported API or licensed for wholesale republication.

Use a layered Facebook approach:

1. **Candidate-authorised Page connection** — after manually claiming a Real Isle profile, a candidate who controls a Facebook Page may connect it through the supported Meta login/Page permission flow. Store revocable tokens in the secret store, not the database/repository. Ingest only the Page/content the candidate explicitly authorises.
2. **Approved public Page access** — investigate Meta App Review and any required Page Public Content Access/business verification for monitoring allowlisted public Pages not controlled by Real Isle. Treat approval as an external dependency, not a launch assumption.
3. **Public-link evidence inbox** — the owner, candidate or contributor submits a specific public Facebook post URL. Real Isle records the URL, observed metadata, necessary excerpt/screenshot where lawful, retrieval time, content digest and review outcome. This is the launch-safe path for candidate personal profiles and posts that the API cannot monitor.
4. **Candidate syndication** — encourage candidates to submit the same statement through their website, manifesto upload, Real Isle candidate portal or a lightweight structured feed as well as Facebook. That creates durable primary evidence without making Facebook the only copy.
5. **Public embed where appropriate** — an individual public post may be embedded using Meta-supported tools after consent/cookie and disappearance behaviour are assessed. The evidence record still needs a stable reviewed excerpt and source-observed timestamp because embeds can vanish.

Facebook safeguards:

- Monitor only manually verified candidate/publication Pages or specific submitted public URLs.
- Do not ingest comments, reactions, friend lists, group membership, engagement counts or supporter identities as candidate intelligence.
- A personal-profile post can establish what a candidate publicly said only after identity and public visibility are manually verified.
- If visibility changes or a post is deleted, mark it unavailable and follow the rights-aware source preservation policy; do not expose a restricted copy merely because Real Isle once saw it.
- Facebook availability, likes and shares never contribute to candidate prominence, credibility or the compass.

YouTube is more suitable for continuous discovery. For each manually verified media/candidate channel:

- store the canonical channel ID and relationship/verification evidence;
- monitor its public upload playlist/channel feed through the supported YouTube Data API;
- ingest title, description, channel, publication time, thumbnail/embedding state and canonical video URL under YouTube policy;
- embed public videos rather than rehosting them unless separate permission exists;
- queue relevant videos for rights review, transcription, speaker identification and topic extraction;
- prefer publisher/candidate-supplied transcripts or captions. The official caption endpoints require authorised access, so public-video discovery does not imply that Real Isle may download caption tracks without channel authorisation;
- preserve the Real Isle transcript only when transcription and retention are lawful, label it as machine/editor-corrected, and always link/timestamp the original video.

Connector health is isolated by platform. Failure or revocation of Meta/YouTube credentials pauses that connector and alerts the owner without removing previously reviewed, lawfully retained evidence.

## 10. Vote compass and Phase II participation research

### 10.1 Launch vote compass

The launch product is an evidence-limited comparison tool, not voting advice. Preferred wording:

> Based only on the reviewed positions currently supported by evidence, these candidates are closest to the views you selected. Missing evidence is excluded rather than treated as agreement or disagreement.

User flow:

1. Select a constituency or explore Island-wide issue questions.
2. Answer a short, neutrally worded set of proposition-level questions on a five-point agree/disagree scale and optionally weight their importance.
3. Calculate candidate similarity entirely in the browser from a signed/versioned public position dataset.
4. Show candidate-by-candidate similarity alongside **evidence coverage**, unknowns, conditional positions, dataset version, and methodology.
5. Let the visitor open every contributing position and inspect its source.
6. Let the visitor change or clear answers at any time.

Privacy requirements:

- Answers and importance weights remain in browser memory/local storage by default and are never sent in analytics, logs, error reports, URLs, or API requests.
- No account, participation token, fingerprint or candidate-intention record is required.
- Clearing the compass removes the local state.
- A future shareable result requires explicit consent and warns that a link may reveal political preferences; the default is a non-identifying candidate-comparison page rather than encoded answers.
- Product analytics may record that the compass was opened/completed only if this can be done without answer values or a persistent political profile.

Methodology requirements:

- Questions are precise propositions, not leading slogans, and receive editorial review before activation.
- Only human-approved candidate positions contribute to similarity.
- Missing/unclear positions do not reduce a candidate's score; they reduce the displayed evidence coverage.
- Conditional positions retain explanatory text and are not flattened silently.
- The scoring formula, question versions, position mappings and dataset checksum are public and open source.
- Candidate order is neutral and never based on similarity until the visitor explicitly asks to see results.
- Results avoid false precision: use bands and plain-language explanation alongside any percentage.
- The compass never says “vote for,” “best candidate,” “winner,” or “most electable.”

### 10.2 Deferred vote-intention pulse

The anonymous candidate-intention pulse moves to Phase II behind a disabled feature flag. It requires separate election-law, privacy, methodology and abuse review. If later approved, it must be labelled a self-selected snapshot, not a representative poll or forecast; use constituency locking, replace rather than duplicate a browser's response, publish participation counts and limitations, apply disclosure thresholds, and close before polling day.

It remains impossible to guarantee one human response while collecting no reliable identifier. Conventional browser tokens can be reset and must never be described as one-person-one-response.

### 10.3 ZK research path for future participation

Zero-knowledge proofs may eventually let a person prove membership of an eligible group and create an election/constituency-specific nullifier to prevent duplicate signalling without publicly revealing identity. Protocols such as [Semaphore](https://docs.semaphore.pse.dev/) demonstrate the pattern, but Real Isle's blockchain implementation will be Sui-native rather than dependent on an EVM contract.

The research architecture is:

1. A trusted issuer verifies eligibility off-chain and adds a privacy-preserving credential commitment to a versioned eligibility root.
2. The visitor generates a proof locally that their credential is included, its constituency attribute satisfies the selected constituency, and the public nullifier is derived correctly for this election/pulse.
3. A Sui Move module verifies the Groth16 proof using Sui's native [`sui::groth16`](https://docs.sui.io/references/framework/sui/groth16) verifier and rejects a nullifier already recorded for the same scope.
4. The on-chain record contains only circuit/version identifiers, eligibility-root reference, scope, nullifier and aggregate-safe signal—not identity, credential, address, postcode or raw preference metadata.
5. Real Isle pays/sponsors submission costs so a member of the public is not required to own SUI or understand wallets.

Sui `zkLogin` may later make contributor/candidate blockchain signing easier through supported OpenID providers, but it proves control of an OIDC identity—not Manx electoral eligibility or constituency. It cannot replace the credential issuer.

However, ZK does not solve identity issuance. A trustworthy organisation must first verify eligibility and issue or enrol a credential. Without cooperation from an electoral authority or another defensible credential issuer, a ZK pulse would only prove that an anonymous cryptographic identity is in a list—not that it corresponds to one eligible Manx voter or the correct constituency.

Phase II research must therefore answer:

- who issues/revokes eligibility credentials and under what authority;
- how constituency membership is proven without exposing address;
- how 16–17-year-old voters and accessibility needs are supported;
- how lost credentials, coercion, delegation and multiple devices are handled;
- whether the complexity and exclusion risk are proportionate for a non-official sentiment feature;
- how circuits, contracts, client code and ceremonies are independently audited.
- how Sui Move verifier limits, nullifier storage, sponsored transaction abuse and upgrade authority are secured.

No blockchain or ZK component is required for the launch vote compass. Any future pulse begins on Sui testnet and requires circuit, Move-package and end-to-end privacy review before a mainnet decision.

## 11. Admin intelligence and suggestion engine

### 11.1 Admin home

The dashboard answers:

- What changed since the last login?
- What requires a decision today?
- Which candidates or constituencies are under-covered?
- Which important claims have conflicting evidence?
- Which sources are failing or stale?
- Is the published compass dataset current, complete and cryptographically consistent with approved positions?
- Did every accepted evidence item produce the expected source snapshot, content digest and audit event?
- What is awaiting a candidate response or correction deadline?

### 11.2 Suggestion types

| Suggestion | Trigger | Admin action |
|---|---|---|
| New prospective candidate | Credible declaration from approved source | Match/create profile; mark prospective only |
| Official status changed | Official notice or withdrawal | Verify and update status |
| Missing website/social link | Credible identity match found | Review identity and publish/decline |
| Broken or redirected link | Scheduled link check | Replace, mark archived, or investigate |
| New/revised manifesto | New document or changed checksum | Compare versions and review affected positions |
| New interview/debate | Approved feed item | Queue transcription and candidate matching |
| Position evidence found | Claim extractor identifies relevant passage | Accept/edit/reject with rationale |
| Potential position conflict | New evidence differs from published record | Reconcile, request clarification, or mark evolving |
| Topic gap | Candidate has no reviewed evidence for a major shared question | Research or send the same question to all candidates |
| Coverage imbalance | Material difference in monitored/reviewed coverage | Check source setup and editorial allocation; never fabricate parity |
| Portrait rights missing | Image has no permission/licence record | Request candidate media asset or use fallback |
| Candidate detail mismatch | Name, constituency, party, or status conflicts | Hold publication until authoritative resolution |
| Duplicate/syndicated story | Similarity and shared source detected | Merge evidence lineage |
| Sensitive/adverse claim | Risk classifier or editor flag | Elevated founder second-pass, stronger evidence, right-of-reply and visible founder-only audit state; two-person review when team expands |
| Correction deadline | Open request approaches service target | Assign/escalate |
| Missing/failed snapshot | Evidence was accepted without a valid preservation result or rights decision | Block position publication or explicitly waive with recorded reason |
| Transparency mismatch | Revision, hash chain, Merkle checkpoint or signature validation fails | Freeze affected publication path and investigate |
| Compass dataset stale | Approved position is absent from or inconsistent with compass export | Rebuild, verify and republish signed dataset |
| Phase II pulse anomaly | Velocity, token pattern, ZK/nullifier or distribution anomaly | Pause display, investigate, annotate |

Every suggestion contains reason, evidence links, confidence, affected public pages, urgency, owner, creation time, decision, and decision rationale. Suggestions never silently change public content.

### 11.3 Editorial workflow states

`discovered → enriched → awaiting review → needs clarification → approved → scheduled/published → corrected/superseded → archived`

David Searle is the sole initial reviewer and may approve all publication types during the founder-operated phase. Sensitive/adverse claims, disputed factual assessments and substantive corrections require an explicit second-pass confirmation, a recorded rationale, primary/corroborating evidence where available, and a visible `founder-only review` audit state. When another qualified reviewer joins, policy should move these categories to enforced two-person approval without changing historical audit records.

### 11.4 Candidate submission and correction workflow

1. Public form accepts a URL and concise explanation; attachments require malware scanning and explicit terms.
2. Requester receives a reference number without needing a public site account. An email is optional only if they want a response, and is stored separately from published candidate intelligence.
3. Admin verifies whether the requester is authorised when claiming to speak for a candidate.
4. Editor evaluates evidence under the same rules used for monitored sources.
5. Decision and rationale are recorded.
6. Material corrections publish a visible note; silent typo fixes remain in the audit log.
7. Suggested service targets: acknowledge within one working day, assess straightforward corrections within two, and prominently flag unresolved material disputes.

Candidate claiming is manual at launch. The owner records verification method and evidence, grants the candidate a constrained submission identity, and may revoke it. A claimed profile can propose official links, images, manifestos, clarifications and disputes; it cannot directly edit public records or see restricted editorial/security information.

### 11.5 Community-evidence and dispute notes

Real Isle will adopt a Community Notes-inspired evidence process without turning truth into a popularity vote or opening an unmoderated comment section.

1. A registered contributor proposes a note against a specific claim, position, source or revision and must provide evidence.
2. The note enters a non-public moderation queue with spam, identity, conflict and source checks.
3. Reviewers can mark it **needs evidence**, **helpful context**, **supports current record**, **material contradiction**, **duplicate**, **out of scope**, or **rejected**, always with a reason.
4. A note cannot directly change a published claim. It opens a review that produces a new version, correction, disputed label or no-change decision.
5. Candidate right-of-reply is shown separately from independent evidence notes.
6. Published notes show sources, version history, decision status and cryptographic audit reference.
7. Reviewer agreement, disagreement and declared conflicts are retained. A future diverse-review algorithm may help prioritise notes, but raw votes or majority preference never establish political truth.

Phase I supports the same workflow with David Searle as the only authenticated contributor/reviewer and an explicit second-pass process for sensitive conclusions. Phase II opens contributor invitations and defines reviewer reputation, diversity, two-person sensitive review and appeal rules in a published Editorial & Evidence Charter.

## 12. Functional requirements

Priority: **P0** launch-critical, **P1** high-value campaign enhancement, **P2** later/archive.

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Browse all 12 constituencies by accessible map and list | P0 |
| FR-02 | Maintain precise prospective/nominated/withdrawn/result status | P0 |
| FR-03 | Display equal-format candidate profiles with licensed portrait or fallback | P0 |
| FR-04 | Attach source/date/context to every candidate position | P0 |
| FR-05 | Compare candidates by precise topic question | P0 |
| FR-06 | Search/filter candidates, topics, sources, and recent material | P0 |
| FR-07 | Monitor configured feeds/pages with health and deduplication | P0 |
| FR-08 | Review and publish suggestions through auditable workflow | P0 |
| FR-09 | Publish methodology, ownership/funding state, AI use, corrections, compass method, and Phase II pulse limitations | P0 |
| FR-10 | Run an evidence-limited vote compass locally in the browser without transmitting answers | P0 |
| FR-11 | Research and, only after separate approval, implement a thresholded and abuse-resistant vote-intention pulse | P2 |
| FR-12 | Candidate/public submission and correction route | P0 |
| FR-13 | Role-based admin access, mandatory MFA, and immutable audit events | P0 |
| FR-14 | Ingest and version official manifestos/declarations | P0 |
| FR-15 | Transcribe an initial set of permitted audio/video with diarisation and timestamps | P0 |
| FR-16 | Discover and propose missing candidate-controlled links | P1 |
| FR-17 | Position change timeline and manifesto diff | P1 |
| FR-18 | Display initial prior manifestos, results and evidenced commitment history for incumbent/returning candidates | P0, curated depth |
| FR-19 | Election-night official result mode with dual verification | P1 |
| FR-20 | Public structured-data/API access with rate limits | P2 |
| FR-21 | Expand 2021 history into a complete permanent campaign and five-year accountability archive | P1 |
| FR-22 | Additional language and easy-read content workflow | P2, after accessibility baseline |
| FR-23 | Run durable periodic source checks without an administrator being logged in, with cursors, backoff, recovery, health alerts, and auditable runs | P0 |
| FR-24 | Deliver new allowlisted headline cards to visitors without a full reload while preventing unreviewed political interpretation from auto-publication | P0 |
| FR-25 | Preserve a rights-aware, content-addressed snapshot/provenance bundle for accepted evidence and version later observations | P0 |
| FR-26 | Generate signed append-only audit events and publish independently verifiable transparency checkpoints | P0 |
| FR-27 | Provide admin claim/position approval, rejection, dispute, correction and revision workflows | P0 |
| FR-28 | Let the owner manually verify candidate profile claims and grant constrained submission access | P1 |
| FR-29 | Add interactive political-system explainers and evidence-grounded AI Q&A | P1 |

## 13. Core data model

| Entity | Essential fields |
|---|---|
| Constituency | ID, name, slug, official identifier, two seats, boundary asset/link, source, verified time |
| Candidate | ID, canonical name, aliases, status, constituency, party/independent, biography fields, portrait asset, official links, verification data |
| CandidateStatusEvent | Candidate, old/new status, effective time, source, reviewer |
| PoliticalOffice | Person, office/role, organisation, start/end dates, authoritative source |
| Election/Candidacy/Result | Election, person, constituency, status, party, votes/result, authoritative source and verification time |
| Manifesto | Candidate/candidacy, election, original source item/snapshot, document version, extracted text, published/superseded dates |
| Pledge | Manifesto/statement, exact text/span, claim type, topic, qualifiers, accountability status and evidence history |
| Topic | ID, name, neutral explainer, sub-questions, taxonomy version, status |
| Proposition | Precise question/claim to which a stance can apply |
| Position | Candidate, proposition, label, summary, date range, review/version state |
| Evidence | Position/claim link, source item, exact span/page/timestamp, evidence type, context, reviewer |
| Source | Publisher, channel/feed, tier, rights, terms/robots review, schedule, health |
| SourceItem | Canonical URL, title, author, published/discovered times, content type/hash, source, rights state |
| SourceSnapshot | Source item/version, retrieval metadata, content digest, object/archive reference, visibility/rights state, extractor and render refs |
| MediaAsset | Owner, licence/permission, URL/storage key, checksum, alt text, crop/focal data, expiry/takedown state |
| Transcript | Source item, origin type, language, model/version, confidence, review state |
| TranscriptSegment | Start/end time, speaker, text, confidence, corrected text/history |
| Claim | Subject, predicate/proposition, object/value, qualifier, evidence, sensitivity, status |
| Event | Declaration, debate, manifesto, withdrawal, correction, result, or other dated campaign event |
| Suggestion | Type, reason, evidence, confidence, urgency, affected objects, owner, decision/rationale |
| Submission | Type, content/link, optional contact stored separately, verification, state, response SLA |
| CandidateClaim | Candidate, claimant admin identity, verification method/evidence, permissions, state, granted/revoked times |
| ReviewNote | Target claim/evidence/revision, contributor, note/evidence, conflict declaration, decision and history |
| Dispute | Target, requester type, reason/evidence, right-of-reply, workflow state, decision and appeal |
| CompassDataset | Version, question set, approved position mappings, scoring method, content digest, signature, publication time |
| PhaseIIPulseParticipant | Keyed token/nullifier, locked constituency, credential/proof metadata, status; implemented only after approval |
| PhaseIIPulseResponse | Participant/nullifier, current selections, version; implemented only after approval |
| PhaseIIPulseIntegrityEvent | Aggregate anomaly type, action, counts, reviewer, public-note requirement |
| Correction | Affected content, request, evidence, decision, public note, timestamps |
| AdminUser | Identity provider ID, role, MFA state, active state |
| Revision | Public object, parent version, canonical payload digest, author/reviewer, reason, publication state/time |
| AuditEvent | Sequence, previous digest, actor/system signature ref, action, object/revision refs, time, reason, correlation ID |
| TransparencyCheckpoint | Event range, Merkle root, signature, published locations, optional on-chain anchor/proof |

The database should use stable internal IDs. Names, URLs, status labels, and constituency assignments can change and must not be primary keys.

## 14. Technical architecture

The initial build should be a modular monolith with background workers, not a microservice estate. The short campaign window favours operational simplicity while preserving clean module boundaries.

### 14.1 Recommended components

- **Public/admin web application:** server-rendered, mobile-first TypeScript application with strong metadata, caching, and accessible components, provisionally deployed on Vercel.
- **Relational database:** managed PostgreSQL for editorial data, versions, provenance, compass datasets, disputes and audit references.
- **Search:** PostgreSQL full-text search initially; add a dedicated search engine only if measured scale or relevance requires it.
- **Object storage:** permitted documents, portraits, derived thumbnails, and permitted audio/transcript artefacts with rights metadata and lifecycle rules.
- **Job system:** durable queue for fetching, parsing, transcription, enrichment, link checking, and notifications; jobs must be idempotent and retry safely.
- **Scheduler:** source-specific cadence with jitter, backoff, and campaign/event overrides.
- **AI services:** speech-to-text and language model behind a provider abstraction; prompts, models, evidence spans, costs, and outputs logged for reproducibility.
- **Admin identity:** managed identity provider with MFA and role claims. Public users do not share this identity system.
- **CDN/WAF:** cache public pages, protect origin, rate-limit admin and submission endpoints, and provide rapid integrity controls.
- **Observability:** structured logs, traces, job metrics, source freshness, editorial queue latency, error reporting, and uptime checks.

### 14.2 Logical modules

- election registry;
- candidate identity and profile;
- source registry and ingestion;
- document/media processing;
- claim/topic/position intelligence;
- editorial workflow and audit;
- publishing/search/cache;
- vote compass and dataset signing;
- transparency log and proof verification;
- Phase II participation/pulse adapter, disabled by default;
- submissions/corrections;
- results/archive.

### 14.3 API boundary examples

- `GET /api/constituencies`
- `GET /api/constituencies/{slug}`
- `GET /api/candidates/{slug}`
- `GET /api/issues/{slug}`
- `GET /api/latest?constituency=&topic=&cursor=`
- `GET /api/compass/{constituency}/dataset` — signed/versioned questions and approved position mappings; no answer submission endpoint
- `GET /api/revisions/{id}` — public revision metadata and provenance
- `GET /api/transparency/checkpoints/latest` — signed tree checkpoint
- `GET /api/transparency/proof/{revision}` — inclusion proof for a public revision
- `POST /api/submissions` — rate-limited, validated, malware-safe attachment flow
- internal/admin APIs for sources, review, suggestions, positions, corrections, and audits

Public responses should expose `lastVerifiedAt`, provenance links, and content version. Admin mutations use optimistic locking to prevent editors overwriting one another.

### 14.4 Availability and graceful degradation

- Candidate, constituency, issue, methodology, and official-link pages remain readable if AI, queues, or poll services fail.
- A source outage does not remove previously verified content; it shows source health to admins.
- Compass delivery can fall back to a last-known signed dataset; a validation failure disables matching while leaving evidence pages available.
- A future pulse, if implemented, remains isolated and independently disableable.
- Election-night result pages use separately controlled, highly cached read paths.
- Backups and point-in-time recovery are enabled before editorial data entry starts.

### 14.5 Cryptographic transparency and blockchain boundary

The objective is independently detectable tampering, not “put the database on a blockchain.” Phase I uses well-understood transparency-log primitives:

1. Canonicalise each public revision and editorial decision into deterministic JSON.
2. Hash the payload and link each audit event to the previous event digest.
3. Batch public revision digests into a Merkle tree.
4. Sign the tree checkpoint with a protected Real Isle publishing identity.
5. Publish the checkpoint and inclusion proofs through the site and a separately controlled public location.
6. Provide an open-source verifier that can validate a revision payload, signature, inclusion proof and checkpoint sequence.
7. Preserve corrections as new leaves; never mutate an earlier leaf.

This follows the same broad model as verifiable transparency systems: append-only logs expose signed checkpoints and efficient inclusion/consistency proofs. [Sigstore Rekor](https://docs.sigstore.dev/logging/overview/) is a useful implementation reference, and [RFC 9162](https://www.ietf.org/rfc/rfc9162.pdf) specifies Merkle-based transparency proof concepts.

Phase I checkpoints are mirrored to at least two independently controlled locations: the production site and the public GitHub release/history. **Sui is the selected network for on-chain anchoring.** Localnet/testnet is used during development; mainnet anchoring begins only after Move tests, key custody, upgrade policy, indexer recovery and public verification are reviewed.

#### Sui Move package design

Package: `real_isle_transparency`

- **`PublisherCap`** — an address-owned capability required to publish a checkpoint. Initially controlled by the founder's protected publishing signer; migrate to Sui `k`-of-`n` multisig when additional accountable reviewers/operators join.
- **`Registry`** — a shared object containing protocol/schema version, next sequence, last checkpoint root/object ID, paused state and authorised package version. Any caller can reference a shared object, so every mutation must also require and validate `PublisherCap`.
- **`Checkpoint`** — one object per anchored batch containing version, first/last audit sequence, Merkle root, previous root, canonicalisation/schema digest and optional off-chain manifest digest. After creation it is made immutable so it cannot be changed, transferred or deleted.
- **`CheckpointPublished` event** — emits checkpoint object ID, root, sequence range, schema/version and previous root for indexing and independent monitoring.
- **`PublisherRotated`/`Paused` events** — record authority and emergency-state changes without altering earlier checkpoints.

`publish_checkpoint` must atomically validate capability, expected sequence, non-empty range, exact previous root and supported schema; update the shared registry; create/freeze the immutable checkpoint; and emit the event. A correction is always a later off-chain revision included in a later checkpoint, never mutation of the earlier object.

#### Anchoring flow

1. Finalise a deterministic off-chain revision batch and Merkle tree.
2. Store manifest, leaves and inclusion proofs in versioned object storage and GitHub release/public endpoint.
3. Sign the checkpoint request through a dedicated protected signer; never keep a raw Sui private key in source control, database, logs or a broadly accessible Vercel variable.
4. Submit the Sui transaction and wait for final transaction effects.
5. Persist network, package ID/version, checkpoint object ID, transaction digest and on-chain sequence against the off-chain checkpoint.
6. Re-read the immutable object/event through an independent Sui data endpoint and verify it matches the intended root before showing `Sui anchored` publicly.
7. Serve a public verifier that checks the revision digest, Merkle inclusion, signed off-chain checkpoint and Sui immutable checkpoint.

Use the official TypeScript SDK with Sui GraphQL/gRPC for new data access. Do not build against deprecated JSON-RPC. Index both historical checkpoint ranges and live events so reconnecting cannot miss an anchor. Sui supports immutable read-only objects, Move events, TypeScript integration and `k`-of-`n` multisig; these are the core primitives for this design. [Sui object ownership](https://docs.sui.io/develop/objects/object-ownership/), [Sui events](https://docs.sui.io/develop/accessing-data/using-events), [Sui SDKs](https://docs.sui.io/references/sui-sdks), [Sui multisig](https://docs.sui.io/develop/transactions/transaction-auth/multisig).

Blockchain rules:

- Store only roots/digests, sequence/schema information and minimal non-personal checkpoint metadata on Sui.
- Never put source text, source URLs containing personal data, candidate details, visitor answers, contributor identities, disputes, IP addresses, credentials or encrypted personal data on-chain.
- Sui anchoring cannot be required for normal publishing; network/provider failure queues the checkpoint without blocking corrections or news and the UI distinguishes `signed` from `Sui anchored`.
- Visitors, candidates and reviewers need no wallet for normal Real Isle use. Real Isle funds checkpoint transactions; no Real Isle token, cryptocurrency incentive or governance-by-token exists.
- Administrator approval uses MFA/passkeys, database authorisation and signed attestations. A Sui publisher capability authorises anchoring, not editorial truth.
- Package upgrades and `UpgradeCap` custody are separate from checkpoint publishing and require manual production approval, tests and a public upgrade record.
- Ordinary Merkle proofs verify publication history. Sui Groth16/ZK is limited to the future eligibility/nullifier research in section 10.3.

### 14.6 Open-source, Codex and Vercel change-safety workflow

The repository is the source of truth for application code, schemas, migrations, prompts, editorial rules, infrastructure configuration and documentation. The production database/object store is the source of truth for curated content and restricted snapshots. Deploying code must never reseed, replace or overwrite curated production records.

Repository target: public personal GitHub repository **`dsearle/real-isle`**. Public site target: **`https://realisle.im`**, connected to the production Vercel project after domain ownership and DNS are configured.

Required workflow:

- Protect `main`; normal Codex work occurs on focused `codex/*` feature branches and is reviewed as a diff before merge.
- Preserve a clean, documented separation between hand-authored source, generated artefacts, database migrations and runtime content.
- Add repository-level instructions and architecture decision records so future Codex tasks discover invariants before editing.
- Never edit an already-applied production migration. Use forward-only, reviewed migrations with stable IDs and an expand/migrate/contract pattern for breaking changes.
- Seed scripts are idempotent, environment-aware and forbidden from overwriting reviewed content. Demo/test fixtures never target production.
- Every branch/PR receives an isolated Vercel preview and non-production data environment. Preview code cannot write to production databases, queues, archives or object storage.
- Run formatting, type checks, unit tests, migration validation, evidence/audit invariants, accessibility checks and core browser flows before production promotion.
- Build one preview artefact, verify it, then promote that same artefact rather than rebuilding unreviewed code for production. Vercel supports branch previews and promotion workflows through its [Git deployment model](https://vercel.com/docs/git) and [deployment system](https://vercel.com/docs/deployments/overview).
- For releases with database changes: apply backward-compatible migration, verify it, promote application, run any resumable data backfill, then remove old fields only in a later release.
- Feature flags isolate unfinished ingestion sources, compass revisions, AI models, experimental visuals, blockchain anchoring and the Phase II pulse.
- Production promotion is an explicit owner action initially. Automatic preview deployments are permitted; automatic production publication from an unreviewed Codex branch is not.
- Point-in-time database recovery, versioned object storage and tested rollback/run-forward procedures are mandatory before substantial curation begins.

Open-source boundary:

- Publish application code, data schemas, scoring logic, public prompts/evaluation fixtures, methodology and audit verifier under **Apache-2.0** initially.
- Publish redistributable public datasets under a separately selected data licence; every exported record retains its own provenance and upstream rights metadata. Apache-2.0 does not grant rights to candidate portraits, publisher content, source snapshots or third-party data.
- Never commit secrets, candidate-claim verification evidence, private contributor details, abuse signals, restricted publisher snapshots or unlicensed media.
- Publish generated public data exports with per-record provenance and licence/rights metadata rather than dumping the internal database.
- Record external dependencies, model/provider versions and reproducible build instructions so a third party can inspect how a release was produced.

## 15. Security, privacy, and governance

### 15.1 Security baseline

- MFA for all admins; least-privilege roles; short sessions for sensitive actions.
- Separate production and non-production data and credentials.
- Secret manager; no credentials in repository, logs, prompts, or browser bundles.
- Input validation and output encoding; CSRF protection; restrictive content-security policy.
- Upload type/size limits, malware scanning, quarantine, and safe document rendering.
- Rate limits for login, search, ingestion controls, and submission routes; separate Phase II controls for any pulse.
- Dependency and container scanning, patch policy, and pre-launch penetration-focused review.
- Tamper-evident append-only audit log exported to separate retention storage.
- Incident runbooks for account compromise, false publication, defamation complaint, source poisoning, audit-signing compromise, snapshot leakage, Phase II pulse manipulation, and election-night traffic.

### 15.2 Roles

| Role | Powers |
|---|---|
| Owner | Configuration, users, legal/policy controls, emergency actions |
| Managing editor | Publish/unpublish, assign, correct, approve sensitive workflows |
| Reviewer | Review evidence, summaries, transcripts, positions |
| Researcher | Add sources/evidence and draft; cannot publish |
| Integrity moderator | View transparency/source integrity and Phase II pulse signals; can pause affected displays but cannot edit candidate content |
| Read-only auditor | Inspect records and audit history |

No one-person workflow should both author and approve a high-risk adverse claim.

### 15.3 Privacy deliverables

- data inventory and retention schedule;
- data-protection impact assessment covering local compass behaviour, logs, submissions, candidate claims, source snapshots, admin/contributor identities, optional candidate contacts, public audit records, and any Phase II pulse credentials/tokens;
- privacy and cookie notices in plain language;
- processor/vendor register and data-location review;
- data-subject request and deletion workflow where applicable;
- default privacy-preserving analytics, with no advertising or cross-site tracking;
- automated deletion of raw technical logs on the shortest operationally defensible schedule;
- separate storage and stricter access for optional correction/submission contact details.

### 15.4 Editorial and legal review

Before launch, obtain Isle of Man-specific advice on:

- election-period and polling-day publication rules, including vote-intention display and closure;
- defamation, malicious falsehood, contempt, and reporting restrictions;
- data protection and electronic communications/cookies;
- copyright, database rights, transcript creation, quotation, thumbnails, and embedding;
- use of official maps, emblems, candidate portraits, and publisher branding;
- AI-derived portraits/illustrations, likeness rights, labelling and source-image permissions;
- takedown, correction, right-of-reply, and records-retention policy;
- whether any expenditure, support, or editorial relationship could be treated as candidate/party campaigning.

This document is a product specification, not legal advice.

### 15.5 Operator, identity and open governance

The publisher/legal operator is unresolved. Open sourcing improves inspection but does not by itself answer who controls data, responds to complaints, owns infrastructure, carries legal risk, pays vendors, or makes final editorial decisions.

Launch must state the current reality plainly: Real Isle is initially founded, published and edited by **David Searle**, who is the only reviewer; formal independent oversight is not yet established; and all funding or in-kind support is disclosed. Qualified Manx advice should confirm the required publisher, contact and data-controller disclosures.

The near-term path is honest founder-operated disclosure, followed by consideration of an incorporated/non-profit operator or non-partisan oversight group and an **Editorial & Evidence Charter**. Reviewer access remains invitation-only initially. Every future reviewer uses an individual authenticated account; shared admin credentials are prohibited. Public cryptographic/Sui audit proves what was published and changed, but it cannot prove that an editorial judgement was fair—methodology, reviewer diversity, appeals and accountable identities remain necessary.

## 16. Non-functional requirements

| Area | Target |
|---|---|
| Accessibility | WCAG 2.2 AA; keyboard, screen reader, zoom/reflow, reduced motion, captions/transcripts, non-colour labels |
| Mobile | Full core journeys at 320 CSS px; map alternative always available |
| Performance | Core public pages target LCP under 2.5s at p75 on mid-tier mobile; CLS under 0.1; responsive interactions under 200ms where local |
| Availability | 99.9% campaign target; separately disable nonessential dynamic functions during incidents |
| Freshness | Healthy priority feeds discovered within 15 minutes; status pages show verified times |
| Live delivery | New allowlisted feed records signalled to connected visitors within 60 seconds of publication to the hub; interface never disrupts the reader's current position |
| Scheduler reliability | At least 99% of scheduled priority-source checks start within twice their configured interval; missed jobs recover without duplication |
| Editorial latency | Priority evidence triaged within 2 working hours during staffed campaign periods; no promise of instant position publication |
| Search | Results under 500ms p95 for normal campaign load |
| Compass privacy | Automated tests confirm answer values never leave the browser; signed dataset loads and verifies before matching |
| Transparency | Public revisions receive a signed checkpoint and verifiable inclusion proof within 24 hours; verifier failure blocks a checkpoint from being represented as valid |
| Preservation | 100% of evidence used in a published position has a recorded snapshot/retention outcome, content digest and rights state |
| Recovery | Point-in-time database recovery; daily restore verification; documented RPO/RTO before beta |
| Browser support | Current and previous major versions; functional low-JavaScript reading experience for core content |
| SEO/social | Canonical URLs, structured metadata, accurate share cards, sitemap, no indexation of admin/drafts |
| Auditability | Every published political summary traceable to evidence, source version, reviewer, public revision and transparency proof |

## 17. Measurement

Success should measure informed use and trust, not outrage or raw dwell time.

### Public metrics

- constituency selection completion;
- candidate profiles viewed per constituency visit;
- comparison completion;
- evidence/source expansion rate;
- issue explainer use;
- correction volume and upheld rate;
- accessibility errors and support requests;
- optional one-question usefulness feedback without personal profiling.

### Editorial/operational metrics

- source freshness and parser success;
- discovery-to-triage and triage-to-publication time;
- percentage of public position summaries with complete evidence metadata (target 100%);
- candidate/topic evidence gaps;
- AI suggestion acceptance/edit/rejection rates by task;
- correction response time;
- transparency verification failures, missing snapshots and unresolved audit events;
- Phase II pulse anomaly rate and interventions, if launched;
- uptime and page performance.

Do not publish candidate page-view rankings or use engagement to reorder candidate prominence.

## 18. Delivery plan for the 2026 election

The calendar is compressed. Scope discipline and editorial staffing are as important as engineering.

### Phase 0 — One-week meaningful public release (9–16 August)

The one-week release is intentionally broad in capability but honest about evidence depth. It covers all 12 constituencies and every credibly declared/prospective candidate found through the approved process; deeper manifesto/interview/history content appears only where evidence is available and reviewed. Empty fields state “not yet found” rather than being filled by inference.

- Establish repository instructions, branch/preview workflow, environments, protected production data, database migrations, backups and feature flags.
- Implement Real Isle design system, accessible Island map/list, constituency routes, visual candidate cards and responsive profiles.
- Build core election/candidate/source/manifesto/claim/evidence/revision models and owner-only admin authentication.
- Seed all 12 constituencies and public prospective-candidate records with precise status/source timestamps.
- Monitor official election pages and an initial allowlist of local news feeds; publish safe **Just in** metadata and queue interpretation.
- Ingest available manifestos/documents into structured claims with source spans, version hashes and admin approve/edit/reject controls.
- Ingest an initial permitted interview/transcript sample with speaker/time evidence and admin review.
- Ship candidate/topic comparison and a local-only vote compass backed solely by approved position data.
- Add initial 2021 manifesto/result/commitment context for returning candidates where reliable public records are available.
- Preserve provenance bundles and generate signed revision/checkpoint data; a minimal public proof viewer is acceptable before a polished verifier.
- Publish methodology, current founder-operated governance state, AI policy, source policy, corrections/disputes route, privacy and rights notices.
- Verify critical mobile, accessibility, security, source-monitoring, compass-privacy and deployment flows on a Vercel preview before explicit production promotion.

**Exit:** a public, polished, evidence-safe Real Isle release by approximately 16 August. It may display incomplete evidence coverage, but no unsupported political conclusion and no hidden candidate prioritisation.

### Phase 1 — Harden, enrich and reconcile nominations (17–30 August)

- Expand candidate profiles, manifestos, verified sites/social links, interviews and incumbent history.
- Acquire rights-cleared candidate portraits/illustrations and Island visual assets; replace fallbacks progressively and neutrally.
- Invite candidates to preview/claim profiles or supply primary evidence without granting editorial control.
- Add contributor invitations only after individual accounts, roles and audit trails work.
- Reconcile every profile against official nominations after the 26 August deadline.
- Ingest official manifestos and relevant-interest documents as available.
- Complete deeper accessibility, security, privacy, performance and editorial scenario testing.
- Publish open-source repository, public data/export boundary and audit-verifier documentation.

**Exit:** stable, searchable product with verified nomination status, operational correction/claim service, richer equal-footing evidence, and independently verifiable revision history.

### Phase 2 — Debate intelligence (31 August–17 September)

- Monitor Manx Radio's scheduled constituency programmes and other approved interviews.
- Ingest permitted captions/transcripts, run candidate/speaker matching, and staff rapid review.
- Publish evidence-backed debate/topic updates and position-change alerts.
- Track candidate coverage gaps and issue unanswered-question sets.

**Exit:** each debate processed to agreed service level; no unreviewed transcript establishes a position.

### Phase 3 — Final campaign and election mode (18–24 September)

- Candidate fact-check window and final shared question follow-up.
- Keep the Phase II pulse disabled unless a later explicit launch decision and legal/integrity gate have passed; close it before polling day if it exists.
- Tighten publication and correction on-call rota.
- Rehearse official results workflow, dual verification, traffic controls, and rollback.
- Switch to election-day guide/results mode on 24 September.

**Exit:** official result records reconciled, timestamped, and visibly sourced; campaign data preserved.

### Phase 4 — Election transition and five-year platform (25 September onward)

- Separate official outcomes from any experimental participation data.
- Publish post-election methodology/integrity report and outstanding corrections.
- Preserve candidate, position, source, and transcript history under the retention/rights plan.
- Transition elected cards into a visual House of Keys and five-year accountability experience.
- Track manifesto commitments, Tynwald activity, votes, roles, statements, policy outcomes and attribution limits through the same evidenced revision model.
- Add the political-system explainer and evidence-grounded **Ask Real Isle** interface as Phase II public experiences.
- Research—but do not presume—the ZK credential issuer and public-checkpoint blockchain anchor.

## 19. P0 acceptance criteria

The initial release is ready only when:

1. All 12 constituencies are navigable by keyboard-accessible list and map.
2. Every person has a precise, sourced candidacy status and last-verified timestamp.
3. Every image has ownership/permission metadata or uses the neutral fallback.
4. Every public candidate position links to at least one reviewed evidence span.
5. “No published position found” is supported throughout the UI and never auto-converted to a stance.
6. Candidate order is neutral and not driven by engagement.
7. Source items are deduplicated and show publisher, original URL, and publication time.
8. An editor can accept, edit, reject, and explain an automated suggestion; no suggestion auto-publishes a political judgement.
9. Corrections can be submitted, assigned, resolved, and displayed publicly when material.
10. The methodology truthfully states the current operator/identity decision, all funding/support, editorial rules, AI role, source policy, open-source boundary, and limitations.
11. Admin MFA, role tests, backups, restore test, rate limits, upload scanning, and audit export are working.
12. Accessibility audit finds no known critical WCAG A/AA blocker in a core journey.
13. Compass answers remain local in automated network/log/error-report tests; missing candidate evidence reduces coverage rather than similarity.
14. The public compass dataset is generated only from approved positions and carries a version, digest, scoring-method version and signature.
15. Legal/privacy/content-rights launch gates are recorded as approved by named owners.
16. Priority monitors continue after restart, preserve their source cursors, retry safely, and do not duplicate already discovered stories.
17. A valid new item from a headline-autopublish source appears in **Just in** and the relevant candidate/constituency module without a deployment, admin login, or full visitor page reload.
18. A malformed or unexpectedly changed source is quarantined automatically and alerts an editor instead of publishing unsafe or misleading content.
19. Every position/commitment used publicly has an immutable revision, evidence span, source digest, recorded preservation/rights outcome, reviewer and dispute route.
20. Public revision/checkpoint data can prove inclusion and detect later mutation; failure to anchor externally does not block a correction.
21. A candidate claim can submit evidence but cannot directly edit or erase the public record.
22. Preview deployments and test/seed/migration commands cannot write to or overwrite production curated data; production promotion requires the owner.
23. Every declared/prospective candidate discovered under the shared source rules receives the same base profile structure, status treatment and ingestion opportunity.

## 20. Principal risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| AI misattributes or oversimplifies a position | Reputational harm and voter misinformation | Evidence spans, speaker confidence, controlled labels, founder review/second-pass for sensitive items, and later two-person review |
| A future anonymous pulse is manipulated or mistaken for polling | Misleading public narrative | Keep disabled in Phase I; require issuer/ZK and methodology research, legal gate, honest naming, thresholds, counts/limitations and ability to pause |
| Candidate list changes rapidly before nominations | Incorrect status | Status-event model, official-source precedence, timestamps, nomination reconciliation |
| Unequal source availability creates apparent candidate inequality | Fairness concern | Coverage-gap dashboard, shared candidate questionnaire, distinguish no evidence from stance, no content-volume ranking |
| Copyright/platform restrictions block full ingestion | Takedown or service interruption | Source rights register, metadata/snippets/links by default, permission-first transcripts/images, replaceable connectors |
| “Snapshot everything” conflicts with copyright, privacy or erasure duties | Restricted data leak or unlawful republication | Rights-aware preservation outcomes, private/public separation, hashes and necessary excerpts by default, tombstones and legal review |
| False or adverse material is published | Defamation/legal/reputational exposure | Source tiers, sensitivity escalation, founder second-pass, candidate right of reply, visible audit state and rapid unpublish/correction runbook |
| Social account is matched to the wrong person | Identity harm | Admin-only leads, cross-link evidence, candidate confirmation, no auto-publication |
| Map or imagery excludes users | Lost access | Equivalent list/search, alt text, keyboard operation, restrained motion, WCAG testing |
| AI character art changes how a candidate is perceived | Bias, reputational harm or misleading presentation | Documentary portrait remains primary; rights-cleared source, uniform neutral style, explicit illustration label and human review |
| Small team cannot review campaign volume | Stale or unsafe content | Strict P0 source list, prioritisation, shift rota for debates, service levels, no unreviewed stance publishing |
| One-week scope causes false completeness or unsafe shortcuts | Loss of trust at launch | Complete base coverage across 12 constituencies, progressive evidence depth, visible unknowns, feature flags and no unsupported claims |
| Sole reviewer handles a sensitive dispute | Weak independence and perceived bias | Disclose founder-only review, require deliberate second pass and reasons, publish conflicts/appeal path, and add independent reviewers later |
| Perceived political bias | Loss of trust | Ownership/funding disclosure, published methodology, equal question set, audit trail, corrections, external editorial adviser |
| Blockchain becomes trust theatre or leaks permanent metadata | Cost, complexity and irreversible privacy harm | Signed transparency log first; roots only; no token/data on-chain; chain adapter optional and independently reviewed |
| ZK pulse lacks a trustworthy credential issuer | Sybil resistance claim is false | Do not launch; document issuer/nullifier assumptions and require independent protocol/circuit audit |
| Codex/deployment overwrites curated live state | Data loss or silent regression | Git branches, isolated previews, protected production, forward-only migrations, idempotent seeds, backups and explicit promotion |
| Open-source release exposes restricted evidence or secrets | Privacy, security or licensing incident | Separate public repository/export from private snapshots and operational secrets; automated secret/licence checks |
| Election-day traffic or attack | Outage | CDN caching, WAF, read-only fallback, experimental-feature isolation, load rehearsal, incident controls |

## 21. Remaining implementation decisions

The product, identity, domain, repository owner, code licence, source families, reviewer model, visual policy and Sui direction are resolved. These implementation choices remain:

1. **Production services and budget:** confirm Vercel account/team, managed PostgreSQL, object storage, queue/scheduler, admin identity, transcription/AI limits, monitoring and expected monthly ceiling.
2. **Public data licence:** select a database/data licence separately from Apache-2.0 and document third-party exceptions.
3. **Domain control:** confirm whether `realisle.im` is already registered; if not, acquisition and DNS configuration are external dependencies.
4. **Facebook connector timing:** launch with the public-link evidence inbox and manual verification; pursue Meta application/business review and candidate-authorised Page connections after the core product unless credentials already exist.
5. **Sui delivery timing:** Phase I implements the off-chain signed/Merkle log and Sui Move package/tests on localnet/testnet; mainnet checkpoint anchoring remains a separately approved production step after key custody and contract review.

## 22. Recommended product decisions

To maximise trust and still launch before the campaign peak:

- Build the evidence hub and local-only compass first; keep the pulse behind a disabled feature flag until its legal, privacy, issuer/ZK and abuse controls pass.
- Launch candidate profiles as soon as sources and status labels are accurate, even if some positions remain “not found.”
- Send every candidate the same structured topic questions and invite official links, portraits, manifestos, and corrections.
- Treat Manx Radio debates as a planned editorial operation, not just an automated transcription job.
- Publish a small source/evidence vocabulary that ordinary users can understand.
- Preserve lawful source snapshots and publish signed revision checkpoints so a removed page cannot silently rewrite what Real Isle relied on.
- Use Git-protected, isolated Vercel previews and forward-only data migrations so continual Codex development is safe by default.
- Use the Island map and portraits as the emotional entrance, then let evidence—not visual drama—carry the political meaning.
- Prefer a transparent, useful incomplete record over a falsely comprehensive automated one.

---

### Working definition of a successful launch

By the 16 August meaningful release, a resident should be able to open Real Isle on a phone, select any constituency, recognise every credibly discovered declared/prospective candidate, open a consistently structured profile, follow continuously monitored news, inspect available manifesto/interview evidence, compare reviewed positions, use a private local-only compass, understand what remains unanswered, and trust that the owner can approve, reject, dispute and visibly correct every published claim. After official nominations close, the same records transition to verified nominated status without rebuilding the pages.
