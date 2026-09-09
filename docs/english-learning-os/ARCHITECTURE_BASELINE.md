# English Learning OS — Architecture Baseline

**Status:** Accepted, versioned baseline  
**Product base:** Readest  
**Architecture:** Product Capability Layers + Implementation Dependency Rings + Kernel Spine

MVP narrows delivery scope. It does not weaken domain ownership, contracts, replaceability, privacy boundaries, or future deployment portability.

## 1. Product capability layers

These are the six layers accepted in the original product design. They describe what the product is made of, not source-code dependency direction.

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. Product Shell                                            │
│ Readest / Web / Tauri / Mobile / Extension / Auth          │
├──────────────────────────────────────────────────────────────┤
│ 2. Learning Experience                                      │
│ Today / Read / Vocabulary / Listen / Speak / Review        │
│ Course / Translate / AI Tutor / Explore / Library          │
├──────────────────────────────────────────────────────────────┤
│ 3. Domain Engines                                           │
│ Content / Lexicon / Activity / Memory / Orchestrator       │
│ Annotation / Course / Media / Search / Analytics           │
├──────────────────────────────────────────────────────────────┤
│ 4. Provider & Connector Runtime                             │
│ AI / Translation / Dictionary / TTS / ASR / Storage       │
│ Sync / Catalog / Search / Payment / Media / Identity       │
├──────────────────────────────────────────────────────────────┤
│ 5. Unified Data Layer                                       │
│ Content / Segment / Locator / Lexeme / Event / Memory      │
│ User / Activity / Annotation                               │
├──────────────────────────────────────────────────────────────┤
│ 6. Resource & Rights Layer                                  │
│ Books / Audio / Video / Courses / Dictionaries / Packs     │
│ Provenance / License / Region / Permission                 │
└──────────────────────────────────────────────────────────────┘

          ║ Kernel Spine crosses all six capability layers ║
```

Readest is the Product Shell and the starting implementation for Reader, Library, platform services, local database, storage, sync, dictionary, translation, AI, and cross-platform behavior. Other projects contribute an Engine, Activity, Provider, Connector, or Resource Pack. Complete applications and their independent data models are not embedded into the product.

## 2. Implementation dependency rings

These rings govern source-code dependencies. They are deliberately not called the six product layers.

```text
Apps / Delivery
      ↓
Application use cases and Learning Orchestrator
      ↓
Domain models and rules
      ↓
Ports owned by the application
      ↑
Adapters and trusted internal plugins
      ↑
Infrastructure and external frameworks
```

Rules:

- Domain imports no React, Next.js, Readest type, database SDK, or provider SDK.
- UI invokes application/runtime contracts rather than vendor clients.
- Adapters translate existing Readest and third-party behavior into owned Ports.
- Internal modules call application contracts directly; HTTP is reserved for process or trust boundaries.
- A Provider response never becomes a public or Domain contract.

## 3. Mapping between the views

| Product capability | Main implementation rings | Examples |
|---|---|---|
| Product Shell | Delivery + Adapters + Infrastructure | Readest UI, Next.js, Tauri, AppService |
| Learning Experience | Delivery + Application | Context Panel, Today, Review, Progress |
| Domain Engines | Application + Domain + Ports | Lexicon, Activity, Memory, Orchestrator |
| Provider Runtime | Ports + Adapters + Kernel | AIProviderPort, ProviderRouter, Readest adapter |
| Unified Data | Domain + repository Ports + Adapters | Locator, LearningEvent, SQLite/PostgreSQL |
| Resource & Rights | Domain + Ports + Resource Pack plugins | Rights, provenance, SPDX, manifests |

The mapping prevents two failures: organizing code by copied upstream application, and treating Clean Architecture folders as the product architecture.

## 4. Kernel Spine

The Kernel is not a seventh business layer. It supplies stable runtime behavior across every capability layer:

```text
ServiceRegistry        CapabilityRegistry
ProviderRegistry       ActionRegistry
ActivityRegistry       PluginRegistry
ContractSchemaRegistry PluginLifecycle
ExecutionRuntime       EventRuntime
JobRuntime             PolicyRuntime
ConfigRuntime          TelemetryRuntime
```

Trusted internal plugin lifecycle:

```text
load → declare → validate → register → start → health → dispose
```

MVP policy:

- Tier 1 internal plugins may execute in-process.
- Tier 2 Resource Packs are data-only and require version, checksum, rights, and provenance.
- Tier 3 third-party executable plugins remain disabled until signature, permission, broker, sandbox, quota, rollback, and revocation controls exist.
- A runtime is wired when a real use case needs it. Declaring every runtime is not a reason to add empty production machinery.

## 5. Stable vocabulary

| Term | Meaning |
|---|---|
| Port | Stable interface owned by this application |
| Provider | One concrete supplier of a capability |
| Adapter | Translation between an external/legacy implementation and a Port |
| Engine | Domain component containing business rules and state transitions |
| Connector | Integration with a catalog, content source, or external system |
| Action | Contextual operation over a SelectionContext |
| Activity | Measurable learning interaction producing an ActivityResult |
| Plugin | Registered implementation with manifest and lifecycle |
| Resource Pack | Versioned, non-executable data with checksum and rights |
| Artifact | Persistable output of an Action, independent of provider wire format |

## 6. One Truth ownership

| Data | Owner | Storage semantics |
|---|---|---|
| Content identity/version/assets/locator | Content Core | Facts |
| Lexeme/Form/Sense/Expression/Occurrence | Lexicon Core | Facts |
| Highlight/note/anchor | Annotation Core | Revision + tombstone |
| ActivitySpec/Attempt/Result | Activity Core | Facts |
| MemoryReviewEvent | Memory Core | Append-only, idempotent |
| Schedule | Memory Core | Rebuildable snapshot |
| LearningEvent | Learning Event Core | Append-only learning fact |
| Today/Progress | Orchestrator/Projection | Rebuildable projection |
| Artifact | Execution Runtime | Durable user artifact or disposable cache by policy |
| TelemetryEvent | Telemetry Runtime | Minimized operational/product signal |
| Rights/provenance | Rights Core | Facts |

LearningEvent, Domain Event, and TelemetryEvent are separate contracts. Private content, selected passages, notes, filenames, AI prompt text, and keys are forbidden in Telemetry by default.

## 7. Core runtime flows

### Contextual action

```text
SelectionContext
→ ActionRegistry
→ Capability + Region + Privacy Policy
→ ProviderRouter
→ ExecutionRuntime
→ Artifact
```

Dictionary, translation, and AI explanation must converge on this path. A temporary Legacy Readest callback is an adapter stage, not the final architecture.

### Learning loop

```text
Content → Understand → Save → Practice → Review → Return
```

- Lookup does not automatically create a ReviewItem.
- Saved Word, Sense, Expression, and Sentence represent distinct learning intentions.
- Every saved object retains its ContentVersion and Locator context.
- Practice writes an ActivityResult and a LearningEvent.
- Review writes an immutable MemoryReviewEvent; the FSRS adapter derives the Schedule.
- Review always offers a route back to the original content and context.

## 8. Standards at system boundaries

- Language tags: BCP 47.
- Publication position: Readium Locator-compatible structures.
- Annotation exchange: W3C Web Annotation-compatible structures.
- Licenses: SPDX identifiers and expressions.
- HTTP contracts: OpenAPI 3.1, JSON Schema 2020-12, and RFC 9457 errors.
- Observability: OpenTelemetry conventions, kept separate from learning facts.
- Object storage: the documented S3-compatible semantic subset, not an SDK type.
- Timed text: WebVTT at the boundary and signed 64-bit milliseconds internally.

Standards govern interchange. Owned Domain models remain free to express stricter invariants.

## 9. Reuse and migration procedure

Every upstream capability follows the same path:

```text
research implementation and license
→ define owned Port and Domain model
→ introduce Legacy Adapter
→ lock behavior with contract/golden-master tests
→ migrate the valuable engine or algorithm
→ replace storage and event ownership
→ integrate the unified UI
→ remove the Legacy Adapter when its exit conditions pass
```

Reuse an engine, algorithm, provider, or standard. Do not embed a second application, duplicate database truth, or expose its vendor types as product contracts.

## 10. Architecture fitness rules

- Dependency tests prevent Domain from importing delivery, framework, Readest, or vendor modules.
- Every provider declares capability, region, privacy, cost, streaming, offline, and health metadata relevant to routing.
- Dictionary, translation, and AI actions share SelectionContext, policy, execution, and Artifact semantics.
- Resource Packs contain no executable code and carry version, checksum, rights, and provenance.
- Event names and payload schemas are versioned contracts; projections may change without rewriting facts.
- No feature may establish a second truth for content, annotations, lexicon, activity, memory, or identity.
- Export and deletion cover source facts, object storage, derived artifacts, and account links according to policy.
- Removing or disabling a provider/plugin cannot make durable user data unreadable.

## 11. Current gaps, not accepted alternatives

The following are explicit migration gaps. They do not redefine the target architecture:

- Translation and dictionary lookup now use the complete Action Runtime path. Dictionary Artifacts keep a portable, inert text representation; Readest's existing rich provider surface remains an explicit presentation fallback for images, links, custom styles, and OS dictionary handoff.
- Learning-object persistence now uses the minimum viable Lexeme/Form/Sense/Expression/Occurrence graph. SavedLearningObject remains the stable review target, points to canonical lexical nodes, and keeps existing Occurrence and review references compatible. A Sense is `unresolved` until a concrete dictionary meaning is selected; dictionary-to-Sense enrichment and multi-sense identity remain explicit follow-up work rather than fabricated data.
- The owned Annotation contract now adapts Readest `BookConfig.booknotes`, retaining its reader, notebook, import/export, tombstone, and sync semantics as the MVP's only writable annotation truth. The unused learning table is preserved only as a renamed legacy archive for unexpected pre-adapter rows. Context Panel composition and general source-change re-anchoring remain experience/application gaps, not alternate stores.
- Plugin, job, config, and telemetry runtimes are only wired where the current vertical slice uses them. The Event Runtime now persists and projects versioned save, Activity, memory-review, and source-return facts.
- Replica-sync learning categories, export/deletion, conflict rules, and locator re-anchoring are incomplete.
- Beta Learning/Telemetry names and payload privacy are reconciled at contract version `1.0.0`; the minimal client event list is integrated, but production metric queries and target-network evidence remain release work rather than architecture alternatives.

These gaps are tracked in `MVP_STATUS.md` and must be removed in risk order rather than hidden behind additional features.

## 12. Change protocol

This file is the versioned engineering architecture baseline for the Fork. A change to ownership, a public contract, dependency direction, plugin trust tier, privacy boundary, or core flow requires:

1. the decision and evidence;
2. compatibility impact;
3. data or adapter migration;
4. verification and rollback path;
5. an update to this baseline and the implementation status.

Product research documents remain valuable inputs. When an older plan conflicts with this baseline or implemented evidence, reconcile the conflict explicitly instead of silently choosing either version.
