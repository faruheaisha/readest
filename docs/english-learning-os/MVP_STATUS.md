# English Learning OS — MVP Implementation Status

**Updated:** 2026-09-09<br>
**Branch:** `mvp/reading-learning-loop`  
**Upstream baseline:** Readest `62b0162d91fff4e857238e1e92017eae4d2a9f31` (`0.12.6`)  
**Status:** Local vertical slice implemented; not yet ready for unrestricted public use

This document reports implemented evidence, migration gaps, and release gates. It does not replace the architecture baseline or turn planned work into completed work.

## Milestone status

| Milestone | Status | Evidence and remaining work |
|---|---|---|
| M0 — Readest baseline | Substantially complete | Fork/upstream remotes, pinned commit, baseline tests, and reuse policy exist. A durable component/license provenance inventory still needs automation. |
| M1 — Contracts + Kernel Spine | Substantially complete | Domain contracts, Ports, registries, manifests, lifecycle, and contract tests exist. Runtimes are intentionally production-wired only for current use cases. |
| M2 — Identity, local data, optional sync | Partial | Stable guest identity and idempotent guest-to-account ownership linking exist. Learning-category replica sync, export, deletion, and explicit sync controls remain. |
| M3 — Content + Context Panel | Partial | Readest selection conversion, Locator context, responsive Context Panel, local learning saves, canonical Lexeme/Form/Sense/Expression/Occurrence persistence, dictionary/translation/AI Action and Artifact flows, and source return exist. Annotation ownership, dictionary-selected Sense enrichment, and re-anchoring remain. Rich dictionary interactions continue through the original Readest surface. |
| M4 — Practice + FSRS + Today | Substantially complete | Recognition, typing, spelling, cloze, immutable review events, FSRS scheduling, Today projection, delayed review, and return-to-source are implemented and tested. |
| M5 — Progress, feedback, operations | Partial | The minimal Beta evidence list, privacy-gated telemetry delivery, Learning-event Progress projection, and consent-gated feedback submission exist. Metric queries, operator triage, quotas dashboard, and OpenTelemetry operations remain. |
| M6 — Public MVP hardening | Not started | Accessibility audit, weak-network validation, end-to-end data controls, backups, resource isolation, legal surfaces, staged rollout, and production evidence are outstanding. |

## Completed implementation slices

| Commit | Delivered slice |
|---|---|
| `9e0126f0` | MVP Kernel, learning domain, storage, Context Panel, Today/Review/Progress, and initial reading loop |
| `2c6be647` | Return from review to source context |
| `ef29978d` | Four pluggable practice activities |
| `f088a8ef` | Contextual AI through the unified Action Runtime |
| `f11e16a5` | Stable guest identity and safe account ownership linking |
| `2fb90353` | Durable contextual AI Artifacts and cache semantics |
| `986c9aa1` | Consent-gated beta feedback collection |
| `d65bdc85` | Context Panel translation through the governed Action/Artifact runtime |
| `b24f7136` | Readest dictionary providers through the governed Action/Artifact runtime with rich-surface fallback |
| `3a6f9bb1` | Unified dictionary, translation, and AI Context Panel action evidence recorded in the implementation baseline |
| `b58d2ff0` | Versioned Beta evidence contracts, privacy-safe telemetry runtime, source-return facts, and legacy event migration |
| `9acd1d8b` | Privacy-minimized content import lifecycle and successfully initialized Reader-open evidence |
| `8ca330ba` | One-per-session Web network timing reduced to coarse TTFB/API latency buckets |
| `18ed2cd5` | Canonical lexical graph, transactional persistence, Domain invariants, and ID-preserving legacy migration |

## Correction queue

These corrections have higher priority than adding new feature areas:

1. **Annotation truth:** adapt Readest BookNote into the owned Annotation contract, or migrate it; do not maintain two writable truths.
2. **Sync and data control:** add learning replica categories, conflict policies, export, deletion, and locator re-anchoring.
3. **Sense enrichment:** connect an explicitly selected dictionary definition to a resolved Sense and freeze multi-sense identity before exposing multiple senses for one Lexeme. Current word/sense saves remain separate review targets, but a Sense without a chosen definition is deliberately marked `unresolved` rather than assigned invented meaning.

## Verification evidence

The latest implementation validation completed successfully before this documentation calibration:

- 15 learning test files, 51 tests passed, including canonical sharing, atomic rollback, and legacy graph migration.
- TypeScript and Biome lint passed across the Readest app.
- Web production build passed.

Lexicon is now one writable graph truth: word and sense review targets can share one canonical Lexeme and lemma Form; expression and sentence targets retain distinct typed Expression nodes; Occurrences continue to point at stable learning-object IDs; and old saves/review references are backfilled without ID rewrites. New and migrated Senses remain explicitly unresolved until the user selects a real dictionary meaning.

The minimal Beta event list is also connected: strict schemas reject selected text; analysis uses a separate pseudonymous identity; review facts are idempotent; legacy save/review facts have a tested SQLite migration; import/open signals use existing Readest orchestration boundaries; and one Web network sample per session stores only coarse latency buckets. This proves contract and integration behavior, not that production analytics, target-network performance, or product hypotheses have been validated.

This is evidence for the new learning slice and whole-app static/build compatibility. It is not evidence that every upstream platform test, multi-device sync path, target network, or production recovery scenario has passed.

## Public release gates

Do not describe the product as public-ready until all of the following have evidence:

- Readest reading behavior has no blocking regression.
- The entire Content → Understand → Save → Practice → Review → Return journey passes in supported browsers and mobile layouts.
- Dictionary, translation, and AI share the governed action contract, with the rich dictionary surface retained as a presentation fallback.
- Learning facts, annotation ownership, and lexical identity have one writable truth.
- Guest-to-account migration and two-device sync do not lose IDs, locators, review facts, or notes.
- Export and account deletion cover local/cloud records, stored assets, and derived artifacts.
- AI failure or quota exhaustion never blocks reading, dictionary, practice, or review.
- Resource isolation, backups, restoration, provider health, and staged rollback are exercised on the target deployment.
- Privacy, rights, upload notice, feedback consent, and weak-network behavior are visible and tested.

Rollout remains staged: internal verification, then bounded cohorts, then broader access based on reliability and product evidence. Cohort sizes and quotas are configurable operating decisions, not architecture constants.

## Canonical engineering documents

- `ARCHITECTURE_BASELINE.md` — capability layers, dependency rules, Kernel Spine, ownership, and fitness rules.
- `README.md` — implementation overview and commands.
- This file — current evidence, gaps, and release gates.
