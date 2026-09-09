# English Learning OS on Readest

This directory records the implementation baseline for the English Learning OS fork. The product reuses Readest as its reader and cross-platform shell, then adds a learning system governed by six product capability layers, implementation dependency rings, and the Kernel Spine.

## Baseline

- Upstream: `readest/readest`
- Pinned commit: `62b0162d91fff4e857238e1e92017eae4d2a9f31`
- Readest version: `0.12.6`
- Implementation branch: `mvp/reading-learning-loop`
- Core loop: `Content → Understand → Save → Practice → Review → Return`

MVP means a smaller delivery scope, not weaker architecture. Domain code cannot import Readest, UI frameworks, databases, or provider SDKs. Existing Readest capabilities enter through adapters and stable ports.

## Architecture views

[`ARCHITECTURE_BASELINE.md`](./ARCHITECTURE_BASELINE.md) is the canonical versioned engineering baseline. It preserves the original six product capability layers from the product design:

1. Product Shell;
2. Learning Experience;
3. Domain Engines;
4. Provider & Connector Runtime;
5. Unified Data Layer;
6. Resource & Rights Layer.

The following implementation dependency rings govern source-code imports. They complement the six product layers; they do not replace or rename them.

### Implementation dependency rings

```text
Apps / Delivery
      ↓
Application use cases and Learning Orchestrator
      ↓
Domain: Content, Lexicon, Activity, Memory, Annotation, Events
      ↓
Ports: repositories, providers, identity, sync, policy, telemetry
      ↑
Adapters / internal plugins: Readest, FSRS, storage, providers
      ↑
Infrastructure: Next.js, SQLite/PostgreSQL, object storage, Docker
```

The Kernel Spine crosses both views and owns typed registries, contract schemas, plugin lifecycle, and execution/event/job/policy/config/telemetry runtimes. Internal plugins follow `load → declare → validate → register → start → health → dispose`. Executable third-party plugins are not enabled in the MVP.

## Current vertical slice

The first implementation slice includes:

- domain models and complete MVP port boundaries;
- registries, runtimes, manifest validation, and internal plugin catalog;
- a Readest `DatabaseService` adapter and isolated `learning.db` migrations;
- an official `ts-fsrs` adapter driven by immutable, idempotent review events;
- a Learning Orchestrator for semantic deduplication, occurrences, review scheduling, and Today projections;
- a canonical Lexeme/Form/Sense/Expression graph behind `LexiconRepositoryPort`, with stable SavedLearningObject review targets and source Occurrences;
- transactional SQLite graph writes plus a compatibility migration that preserves existing learning-object and review IDs; unresolved legacy/new Sense targets are never assigned fabricated definitions;
- one Annotation repository contract over Readest's existing `BookConfig.booknotes` truth, preserving highlight styles, sync metadata, compatibility pointers, tombstones, and existing reader/notebook/import/export behavior;
- stable content-version IDs derived from Readest's source-file hash rather than mutable book-configuration timestamps;
- conversion from Readest text selections to stable `SelectionContext` and Readium-style locators;
- a Learn action in the existing reader toolbar;
- responsive Context Panel, Today, Review, and Progress interfaces;
- explicit Save versus Save & Practice behavior;
- return-to-source navigation through Readest's existing reader route and saved locator;
- four Activity engines (Recognition, Typing, Spelling, and Cloze) behind one port, with persisted specs, attempts, results, and separate learning events;
- a unified AI Explain action path through Action Registry, Policy/Quota, Provider Router, Execution Runtime, and Artifact;
- Context Panel translation through the same governed action path, backed by the configured Readest translator and its existing cache;
- Context Panel dictionary lookup through the same path, storing an inert portable-text Artifact while preserving Readest's full rich-result surface as an explicit fallback;
- reuse of Readest's Ollama, AI Gateway, and OpenAI-compatible BYOK providers behind `AIProviderPort`;
- an authenticated platform AI fallback with a configurable daily allowance, input limits, fixed operator-selected model, and server-side usage ledger;
- durable local Artifact caching keyed by action, full selection context, prompt version, provider, model, and locale;
- an `IdentityPort` adapter over Readest's existing Supabase session plus a stable local guest identity;
- idempotent guest-to-account ownership linking that preserves every learning object ID and refuses silent reassignment to another account;
- a consent-gated feedback route for guests and accounts, with server-derived account ownership and no reading content in diagnostics;
- versioned `1.0.0` Learning and Beta Telemetry contracts with strict payload schemas, stable per-tab sessions, and pseudonymous local actor identity;
- governed evidence for Context actions, saves, Activities, memory reviews, Today starts, source returns, and feedback, delivered through Readest's existing consent-aware telemetry utility;
- a compatibility migration that converts persisted legacy learning facts without changing learning-object IDs;
- privacy-minimized import lifecycle evidence at Readest's existing ingestion path and content-open evidence only after the Reader view initializes successfully;
- one consent-aware Web network sample per client session, reduced locally to coarse TTFB/API latency buckets with no probe request, URL, IP, or location payload;
- English and Simplified Chinese UI copy.

Dictionary, translation, and AI run through owned Ports and the unified Action/Artifact runtime without duplicating Readest's provider clients. Dictionary lookup extracts a safe, portable textual Artifact from the enabled providers; users can still open the original rich surface for provider-specific images, links, styles, and OS handoff. A configured user AI provider is preferred; signed-in users otherwise receive the operator-funded platform allowance. BYOK and local models do not consume that allowance.

Platform AI operations use `AI_GATEWAY_API_KEY` on the server. `AI_DAILY_ACTION_QUOTA` controls the per-account daily request allowance (default `10`), while `AI_PLATFORM_MODEL` controls the only model callers may use with the platform key. Client-supplied model names are ignored for operator-funded calls.

## Not complete yet

This slice is architecture and the first end-to-end local flow, not the public MVP release. The release still requires Context Panel note composition, explicit dictionary-selected Sense enrichment, production metric queries, browseable Artifact history, locator re-anchoring after source changes, account-associated replica-sync categories, export/deletion, operator feedback triage tooling, broader resource limits, and public-beta hardening.

See [`MVP_STATUS.md`](./MVP_STATUS.md) for evidence-backed milestone status, the correction queue, and release gates.

## Verification

New behavior is covered under `apps/readest-app/src/__tests__/learning`. Before merging, run from `apps/readest-app`:

```text
pnpm test -- --run --maxWorkers=2
pnpm lint
pnpm build-web
```

On constrained Windows hosts, TypeScript 7's native checker may require reduced Go runtime concurrency (for example two workers) to avoid exhausting memory. This changes validation resource use, not compiler strictness.

## Upstream policy

- Keep `upstream` pointing to `readest/readest` and `origin` pointing to the product fork.
- Record the upstream commit for every integration milestone.
- Wrap existing behavior with an adapter and golden-master/contract tests before replacing it.
- Keep provider types out of Domain and public contracts.
- Record source, version, license, modified locations, and update strategy for every reused component.

## Documentation truth

Engineering architecture and implementation status are versioned in this directory. Research, PRD, validation, and historical planning documents outside the Fork remain inputs; when they conflict with implemented evidence or this baseline, record and reconcile the decision rather than silently drifting.

### Resuming work without chat history

The repository, not a chat transcript, is the durable engineering memory. Resume in this order:

1. fetch `origin/mvp/reading-learning-loop` and inspect the local/remote divergence;
2. read `ARCHITECTURE_BASELINE.md` for non-negotiable boundaries and ownership;
3. read `MVP_STATUS.md` for implemented evidence, correction order, and release gates;
4. inspect commits after the pinned Readest baseline instead of inferring completion from plans;
5. run the relevant tests, lint, and build before advancing the first unfinished correction.

Every implementation batch should end with a focused code commit, an evidence/status update when the truth changed, and a pushed remote branch. Chat discussions may explain intent, but they do not override tested code, recorded decisions, or explicit unresolved gaps.
