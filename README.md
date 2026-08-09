# Real Isle

An open, evidence-led civic intelligence platform for the Isle of Man, launching with the 2026 House of Keys election and designed to continue as a five-year public accountability service.

- Planned public site: `realisle.im`
- Founder and initial editor: David Searle
- Code licence: Apache-2.0 (third-party content and data have separate rights)

- [Project brief and product specification](docs/PROJECT_BRIEF.md)

## Current build

The first reviewable product slice includes:

- an Island-led home page and all 12 House of Keys constituencies;
- source-linked prospective-candidate evidence profiles;
- a Manx Care, offshore-wind and housing comparison matrix;
- a reviewed election-news desk;
- a browser-only vote-compass methodology preview; and
- a founder evidence-review workspace prototype.

Candidate records in this build are clearly marked as prospective declarations.
Formal nominations for the 2026 election do not close until 1pm on 26 August.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npx tsc --noEmit
npm test
```
