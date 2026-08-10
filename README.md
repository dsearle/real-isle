# The People's Isle

An open, evidence-led civic intelligence platform for the Isle of Man, launching with the 2026 House of Keys election and designed to continue as a five-year public accountability service.

- Planned public site: `realisle.im`
- Founder and initial editor: David Searle
- Code licence: Apache-2.0 (third-party content and data have separate rights)

- [Project brief and product specification](docs/PROJECT_BRIEF.md)
- [Evidence ingestion and audit pipeline](docs/DATA_PIPELINE.md)

## Current build

The first reviewable product slice includes:

- an Island-led home page and all 12 House of Keys constituencies;
- source-linked prospective-candidate evidence profiles;
- a Manx Care, offshore-wind and housing comparison matrix;
- a reviewed election-news desk;
- a browser-only vote-compass methodology preview; and
- a founder evidence-review workspace;
- a private research-operations dashboard showing candidate coverage, source
  health, ingestion runs, portrait-rights gaps, retrieved evidence and the
  transcript pipeline as records arrive;
- a maintained evidence ledger that monitors approved news, audio, video and
  parliamentary feeds while keeping newly discovered material private until
  editorial review; and
- a self-updating candidate registry that discovers profile text, public links,
  manifestos, transcripts and portrait references without publishing unreviewed
  data or copying rights-uncleared images.

Structured civic records, source observations and review state are stored in
Cloudflare D1. Content-addressed source captures are retained privately in R2,
subject to each publisher's rights policy. Immutable versions and a hash-linked
audit log preserve how every record was produced; a future Sui integration will
anchor hashes only, never publisher content or personal data.

Candidate records in this build are clearly marked as prospective declarations.
Formal nominations for the 2026 election do not close until 1pm on 26 August.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Quality checks:

```bash
npm run lint
npx tsc --noEmit
npm test
```

The deployed Worker opportunistically checks due sources in the background when
the site receives traffic. A dormant GitHub Actions schedule is also included
for clock-driven checks; see the pipeline guide for the three secrets required
to activate it for the private preview.
