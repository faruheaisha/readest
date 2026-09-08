# English Learning OS — MVP Implementation Status

**Updated:** 2026-09-08  
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
| M3 — Content + Context Panel | Partial | Readest selection conversion, Locator context, responsive Context Panel, local learning saves, dictionary/translation/AI Action and Artifact flows, and source return exist. Lexical graph persistence, annotation ownership, and re-anchoring remain. Rich dictionary interactions continue through the original Readest surface. |
| M4 — Practice + FSRS + Today | Substantially complete | Recognition, typing, spelling, cloze, immutable review events, FSRS scheduling, Today projection, delayed review, and return-to-source are implemented and tested. |
| M5 — Progress, feedback, operations | Partial | Learning-event Progress projection and consent-gated feedback submission exist. Event contract reconciliation, product telemetry, operator triage, quotas dashboard, and OpenTelemetry operations remain. |
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

## Correction queue

These corrections have higher priority than adding new feature areas:

1. **Lexicon truth:** replace flattened learning-object persistence with the minimum viable Lexeme/Form/Sense/Expression/Occurrence graph while preserving current IDs and behavior.
2. **Annotation truth:** adapt Readest BookNote into the owned Annotation contract, or migrate it; do not maintain two writable truths.
3. **Event contract:** freeze versioned Domain/Learning/Telemetry event names and privacy-safe beta measurements before collecting public product signals.
4. **Sync and data control:** add learning replica categories, conflict policies, export, deletion, and locator re-anchoring.

## Verification evidence

The latest implementation validation completed successfully before this documentation calibration:

- 14 learning test files, 50 tests passed.
- TypeScript and Biome lint passed across the Readest app.
- Web production build passed.

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
