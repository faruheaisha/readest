# Learning sync implementation checkpoint — 2026-09-10

Status: implementation checkpoint; not release-ready.

## Implemented

- Provider-neutral SyncPort, category ports, transport port, dependency registry, and application service.
- Readest replica transport and in-memory transport; existing HLC, cursors and encryption are reused.
- Lexicon, memory, activity and learning-event categories. Occurrences, reviews and attempts travel in individual records rather than growing LWW arrays.
- Canonical local ID mapping and schedule reconstruction from immutable review events through the existing FSRS adapter.
- Required payload encryption and server rejection of plaintext learning payloads.
- Missing backend replica kinds fail explicitly; unauthenticated transport reports disabled.

Domain code does not depend on Readest or supplier SDKs. Annotation remains owned by Readest BookNote. Schedule and Today remain projections rather than additional synchronization truths.

## Verified in the preceding work session

- Project-standard learning tests: 18 files, 67 tests passed.
- Replica schema/category/publish/pull regression tests: 4 files, 95 tests passed.
- TypeScript passed with GOMAXPROCS=2; Biome checked 2422 files successfully.
- Production Web build attempted but failed with native memory allocation errors. The last constrained retry has no confirmed completion. Do not report the current build as passed.
- No authenticated two-device or production encryption round trip has been verified.

Use `pnpm --filter @readest/readest-app test --run ... --maxWorkers=1 --no-file-parallelism` for tests: the project script loads its test environment. Direct `exec vitest` bypasses that environment and caused unrelated Supabase initialization failures. Removing the new transport from the adapter barrel alone did not resolve those failures.

## Next required corrections

1. Enforce explicit opt-in and category/provider gating on both direct push and direct pull. Publishing must not report success when the underlying publisher skips disabled categories.
2. Import remote learning facts without re-emitting product telemetry. The production category currently receives the event runtime that also forwards facts to telemetry.
3. Exercise concurrent two-device reviews and canonical merges against the database implementation, including policy and seed convergence.
4. Implement deletion/tombstone handling and export across local and remote data. Current category apply ignores deleted records; this is not a completed deletion protocol.
5. Add the user-facing sync action and recovery/status flow after these boundaries pass verification.
6. Obtain a successful Web build, then authenticated two-device evidence before enabling public sync.

## Recovery

Continue on `mvp/reading-learning-loop` in the Readest fork. Inspect Git status before editing. This checkpoint records partial implementation, not a deployment or a completed MVP milestone. No production migration or deployment was performed in this batch.
