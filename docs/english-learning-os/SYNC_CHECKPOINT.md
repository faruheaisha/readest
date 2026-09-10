# Learning sync implementation checkpoint — 2026-09-10

Status: implementation checkpoint; not release-ready.

## Implemented

- Provider-neutral SyncPort, category ports, transport port, dependency registry, and application service.
- Readest replica transport and in-memory transport; existing HLC, cursors and encryption are reused.
- Lexicon, memory, activity and learning-event categories. Occurrences, reviews and attempts travel in individual records rather than growing LWW arrays.
- Canonical local ID mapping and schedule reconstruction from immutable review events through the existing FSRS adapter.
- Required payload encryption and server rejection of plaintext learning payloads.
- Missing backend replica kinds fail explicitly; unauthenticated transport reports disabled.
- Learning sync defaults off; UI, transport, category apply, and the application service share one consent predicate.
- Consent is re-checked after every network/decryption await and before each applied record, so a withdrawn response is discarded instead of imported.
- Every push/pull is bound to the authorizing account and re-verified before each remote or local effect; a sign-out or account switch aborts rather than flushing or importing the previous account's data.
- A required-encryption record that cannot be encrypted (no key, signed-out session) fails loudly instead of silently reporting success; optional non-required categories keep the original no-op behaviour.
- Remote learning facts pass `origin: 'sync'` through LearningEventPort, so imported events persist without re-broadcasting local product telemetry.

Domain code does not depend on Readest or supplier SDKs. Annotation remains owned by Readest BookNote. Schedule and Today remain projections rather than additional synchronization truths.

## Verified in the preceding work session

- Project-standard learning tests: 18 files, 67 tests passed.
- Replica schema/category/publish/pull regression tests: 4 files, 95 tests passed.
- TypeScript passed with GOMAXPROCS=2; Biome checked 2422 files successfully.
- Production Web build attempted but failed with native memory allocation errors. The last constrained retry has no confirmed completion. Do not report the current build as passed.
- No authenticated two-device or production encryption round trip has been verified.

Use `pnpm --filter @readest/readest-app test --run ... --maxWorkers=1 --no-file-parallelism` for tests: the project script loads its test environment. Direct `exec vitest` bypasses that environment and caused unrelated Supabase initialization failures. Removing the new transport from the adapter barrel alone did not resolve those failures.

## Next required corrections

1. Direct push and pull check the existing category/provider gate before accessing the transport; disabled calls reject rather than reporting success, and status is disabled. Learning sync defaults off. UI, transport, category apply, and the application service share `isSyncCategoryEnabled('learning')`, removing duplicated defaults. Mid-operation setting changes are covered: pull re-checks after the network and decryption awaits, each category re-checks before every applied record, and the manager re-checks each dispatch including retries. The transport re-verifies the authorizing account before each effect. See "This batch" below for the evidence.
2. Remote learning facts pass `origin: 'sync'` through LearningEventPort. The runtime persists them without broadcasting local-action side effects; local publication retains its existing behavior. Covered by focused tests asserting telemetry is not called on import and is called on a local publish.
3. Exercise concurrent two-device reviews and canonical merges against the database implementation, including policy and seed convergence.
4. Implement deletion/tombstone handling and export across local and remote data. Current category apply ignores deleted records; this is not a completed deletion protocol.
5. Add the user-facing sync action and recovery/status flow after these boundaries pass verification. No UI currently calls `SyncPort`, so the account-scope and consent guards are exercised only through the transport and service contracts.
6. Obtain a successful Web build, then authenticated two-device evidence before enabling public sync.

## This batch — consent and event boundaries (2026-09-10)

Scope: finish consent authorization and event boundaries A–I without weakening architecture or inventing a second sync protocol.

Implemented:

- **D** — `LearningSyncService.pull` re-checks consent after the transport returns and before each category applies; every category adapter also re-checks per record, so a revoked pull stops importing and reports failure rather than a partial success.
- **F** — `ReadestReplicaSyncAdapter` binds each push/pull to the authorizing subject id and re-verifies it before every remote or local effect; sign-out or an account switch aborts with `Learning sync account changed` and reports `disabled`. Learning pulls always request `{ since: null }`, so a cursor written by a previous account cannot narrow the active session's first pull.
- **H** — `publishReplicaUpsert` now fails loudly for a `required`-encryption record it cannot carry (no key, signed-out session, uninitialized sync) instead of silently no-oping to a reported success. Optional, non-required categories keep the original no-op behaviour.
- **G** — unchanged from the previous checkpoint; still covered by the focused tests.

Known residual risk (not fixed in this batch, deliberately out of scope):

- `SystemSettings.lastSyncedAtReplicas` is not account-scoped, so a cursor written under account A persists for account B on the same device. Learning is immune because it always pulls with `{ since: null }`, but other replica categories that use incremental cursors can skip rows after an account switch. Scoping the cursor key by subject id is a cross-cutting change to shared Readest sync and needs its own migration and review.

Verification for this batch is recorded in the commit message and the batch report. The full-suite run alongside these edits reports unrelated pre-existing failures in dictionary plugin and document-loader areas; it is not acceptance evidence for this batch.

## Recovery

Latest consent and account-scope corrections: 6 focused files, 81 tests passed; the same files pass again after the account and encryption tests were finalised (see the batch report for the exact command and counts). Pull rechecks consent after network/decryption awaits and rejects responses when consent is withdrawn; push checks before each record and before flush. Already dispatched requests cannot be recalled, and queued writes remain queued until consent is restored — the manager retains them and re-checks on every dispatch. An earlier full-suite run overlapped edits and reported a consent-test failure against stale loaded code; it is not valid acceptance evidence. Run the full suite against a fixed checkpoint before release.

Continue on `mvp/reading-learning-loop` in the Readest fork. Inspect Git status before editing. This checkpoint records partial implementation, not a deployment or a completed MVP milestone. No production migration or deployment was performed in this batch.
