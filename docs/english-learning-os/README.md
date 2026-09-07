# English Learning OS on Readest

This directory records the implementation baseline for the English Learning OS fork. The product reuses Readest as its reader and cross-platform shell, then adds a learning domain governed by `6 Layers + Kernel Spine`.

## Baseline

- Upstream: `readest/readest`
- Pinned commit: `62b0162d91fff4e857238e1e92017eae4d2a9f31`
- Readest version: `0.12.6`
- Implementation branch: `mvp/reading-learning-loop`
- Core loop: `Content → Understand → Save → Practice → Review → Return`

MVP means a smaller delivery scope, not weaker architecture. Domain code cannot import Readest, UI frameworks, databases, or provider SDKs. Existing Readest capabilities enter through adapters and stable ports.

## Six layers

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

The Kernel Spine owns typed registries, contract schemas, plugin lifecycle, and execution/event/job/policy/config/telemetry runtimes. Internal plugins follow `load → declare → validate → register → start → health → dispose`. Executable third-party plugins are not enabled in the MVP.

## Current vertical slice

The first implementation slice includes:

- domain models and complete MVP port boundaries;
- registries, runtimes, manifest validation, and internal plugin catalog;
- a Readest `DatabaseService` adapter and isolated `learning.db` migrations;
- an official `ts-fsrs` adapter driven by immutable, idempotent review events;
- a Learning Orchestrator for semantic deduplication, occurrences, review scheduling, and Today projections;
- conversion from Readest text selections to stable `SelectionContext` and Readium-style locators;
- a Learn action in the existing reader toolbar;
- responsive Context Panel, Today, Review, and Progress interfaces;
- explicit Save versus Save & Practice behavior;
- return-to-source navigation through Readest's existing reader route and saved locator;
- English and Simplified Chinese UI copy.

The Context Panel delegates meaning and translation back to Readest's existing providers. It does not duplicate dictionary or translation engines.

## Not complete yet

This slice is architecture and the first end-to-end local flow, not the public MVP release. The release still requires AI provider routing/BYOK/quota, all four activity UIs, locator re-anchoring after source changes, replica-sync categories, email identity and guest migration, export/deletion, feedback/operator tooling, resource limits, and public-beta hardening.

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
