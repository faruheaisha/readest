import type {
  ActionDefinition,
  ActionExecution,
  ActivityAttempt,
  ActivityKind,
  ActivityResult,
  ActivitySpec,
  Annotation,
  Artifact,
  ContentAsset,
  ContentItem,
  Entitlement,
  LearningEvent,
  LearningObjectIdentity,
  LearningSyncCategoryDescriptor,
  LearningSyncCategoryId,
  LearningSyncRecord,
  LearningSyncResult,
  LearningSyncStatus,
  LexicalGraph,
  LearningObjectKind,
  Locator,
  MemoryReviewEvent,
  Occurrence,
  ProviderMetadata,
  ResourcePackManifest,
  ReviewItem,
  Rights,
  SavedLearningObject,
  Schedule,
  SelectionContext,
  TelemetryEvent,
  TodayPlan,
} from '../domain';

export type Awaitable<T> = T | Promise<T>;

export interface ContentRepositoryPort {
  get(id: string): Promise<ContentItem | null>;
  save(content: ContentItem): Promise<void>;
  list(): Promise<readonly ContentItem[]>;
}

export interface ContentParserPort {
  readonly supportedMediaTypes: readonly string[];
  parse(asset: ContentAsset): Promise<ContentItem>;
}

export interface CatalogConnectorPort {
  search(query: string, language?: string): Promise<readonly ContentItem[]>;
}

export interface LexiconRepositoryPort {
  upsertLearningObject(
    learningObject: SavedLearningObject,
    graph: LexicalGraph,
    occurrence: Occurrence,
  ): Promise<{ learningObject: SavedLearningObject; created: boolean; occurrenceCreated: boolean }>;
  getLearningObject(id: string): Promise<SavedLearningObject | null>;
  findLearningObject(identity: LearningObjectIdentity): Promise<SavedLearningObject | null>;
  getLexicalGraph(learningObjectId: string): Promise<LexicalGraph | null>;
  listAll(): Promise<readonly SavedLearningObject[]>;
  listRecent(limit: number): Promise<readonly SavedLearningObject[]>;
  listOccurrences(learningObjectId: string): Promise<readonly Occurrence[]>;
}

export interface DictionaryProviderPort {
  readonly resultVersion: string;
  describe(): Awaitable<ProviderMetadata>;
  isAvailable(): Promise<boolean>;
  lookup(selection: SelectionContext): Promise<Artifact>;
}

export interface AnnotationRepositoryPort {
  save(annotation: Annotation): Promise<void>;
  listByContent(
    contentId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<readonly Annotation[]>;
  delete(contentId: string, id: string, deletedAt?: Date): Promise<void>;
}

export interface ActivityRepositoryPort {
  getSpec(id: string): Promise<ActivitySpec | null>;
  findSpecByLearningObject(
    learningObjectId: string,
    kind: ActivityKind,
  ): Promise<ActivitySpec | null>;
  listSpecs(): Promise<readonly ActivitySpec[]>;
  listAttempts(
    activityId: string,
  ): Promise<readonly { attempt: ActivityAttempt; result: ActivityResult }[]>;
  saveSpec(spec: ActivitySpec): Promise<void>;
  saveAttempt(attempt: ActivityAttempt, result: ActivityResult): Promise<void>;
}

export interface ActivityEnginePort {
  readonly kind: ActivityKind;
  createSpec(
    id: string,
    learningObject: SavedLearningObject,
    occurrence?: Occurrence,
  ): ActivitySpec;
  evaluate(attempt: ActivityAttempt, spec: ActivitySpec): ActivityResult;
}

export interface MemoryRepositoryPort {
  getReviewItem(id: string): Promise<ReviewItem | null>;
  findReviewItemByLearningObject(learningObjectId: string): Promise<ReviewItem | null>;
  listReviewItems(): Promise<readonly ReviewItem[]>;
  saveReviewItem(item: ReviewItem): Promise<ReviewItem>;
  appendReviewEvent(
    event: MemoryReviewEvent,
  ): Promise<{ event: MemoryReviewEvent; created: boolean }>;
  listReviewEvents(reviewItemId: string): Promise<readonly MemoryReviewEvent[]>;
  saveSchedule(schedule: Schedule): Promise<void>;
  getSchedule(reviewItemId: string): Promise<Schedule | null>;
  listDue(at: Date): Promise<readonly { reviewItem: ReviewItem; schedule: Schedule }[]>;
}

export interface MemorySchedulerPort {
  schedule(
    reviewItem: ReviewItem,
    event: MemoryReviewEvent,
    currentSchedule?: Schedule,
  ): Awaitable<Schedule>;
}

export interface LearningPlanPort {
  save(plan: TodayPlan): Promise<void>;
  get(id: string): Promise<TodayPlan | null>;
  getByDate(date: string): Promise<TodayPlan | null>;
}

export interface LearningOrchestratorPort {
  saveSelection(
    selection: SelectionContext,
    kind: LearningObjectKind,
    saveMode?: 'save' | 'save_and_practice',
  ): Promise<{ learningObject: SavedLearningObject; created: boolean }>;
  recordSourceReturn(occurrence: Occurrence, memorySubjectId: string): Promise<void>;
  getTodayPlan(): Promise<TodayPlan>;
}

export interface ActionExecutionPort {
  execute(action: ActionDefinition, selection: SelectionContext): Promise<ActionExecution>;
}

export interface ArtifactCachePort {
  getArtifact(key: string): Promise<Artifact | null>;
  putArtifact(key: string, artifact: Artifact): Promise<void>;
}

export interface TranslationProviderPort {
  readonly resultVersion: string;
  describe(): Awaitable<ProviderMetadata>;
  isAvailable(): Promise<boolean>;
  translate(selection: SelectionContext, targetLanguage: string): Promise<Artifact>;
}

export interface AIProviderPort {
  readonly promptVersion: string;
  describe(): ProviderMetadata;
  isAvailable(): Promise<boolean>;
  explain(selection: SelectionContext, targetLanguage: string): Promise<Artifact>;
}

export interface ObjectStoragePort {
  put(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export interface LearningSyncCategoryPort {
  readonly descriptor: LearningSyncCategoryDescriptor;
  collect(): Promise<readonly LearningSyncRecord[]>;
  apply(records: readonly LearningSyncRecord[]): Promise<{ applied: number; ignored: number }>;
}

/** Transport only moves opaque, already policy-approved records. */
export interface LearningSyncTransportPort {
  push(records: readonly LearningSyncRecord[]): Promise<void>;
  pull(categories: readonly LearningSyncCategoryId[]): Promise<readonly LearningSyncRecord[]>;
  status(): Promise<LearningSyncStatus>;
}

export interface SyncPort {
  sync(categories?: readonly LearningSyncCategoryId[]): Promise<LearningSyncResult>;
  publish(categories?: readonly LearningSyncCategoryId[]): Promise<number>;
  pull(categories?: readonly LearningSyncCategoryId[]): Promise<{ pulled: number; applied: number; ignored: number }>;
  status(): Promise<LearningSyncStatus>;
}

export interface JobPort {
  enqueue<TPayload>(kind: string, payload: TPayload, idempotencyKey: string): Promise<string>;
}

export interface IdentityPort {
  currentSubject(): Promise<{ id: string; email?: string; verified: boolean } | null>;
  migrateGuest(guestId: string, subjectId: string): Promise<void>;
}

export interface LearningIdentityRepositoryPort {
  getOrCreateGuestId(candidateId: string): Promise<string>;
  linkGuestIdentity(guestId: string, subjectId: string, linkedAt: Date): Promise<void>;
  getLinkedSubject(guestId: string): Promise<string | null>;
}

export interface EmailPort {
  sendVerification(email: string, verificationUrl: string): Promise<void>;
}

export interface PolicyPort {
  authorize(subjectId: string | null, capability: string): Promise<boolean>;
}

export interface RightsPort {
  classify(content: ContentItem): Promise<Rights>;
  canPerform(rights: Rights, action: 'read' | 'sync' | 'export' | 'share'): boolean;
}

export interface QuotaPort {
  consume(
    subjectId: string,
    capability: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<boolean>;
}

export interface EntitlementPort {
  list(subjectId: string): Promise<readonly Entitlement[]>;
  has(subjectId: string, capability: string): Promise<boolean>;
}

export interface PaymentPort {
  readonly enabled: boolean;
}

export interface FeedbackPort {
  submit(input: {
    message: string;
    diagnosticConsent: boolean;
    diagnostics?: {
      route?: string;
      locale?: string;
      platform?: string;
      appVersion?: string;
    };
  }): Promise<string>;
}

export interface TelemetryPort {
  capture(event: TelemetryEvent): Promise<void>;
}

export interface LearningEventPort {
  publish(event: LearningEvent): Promise<void>;
  list(): Promise<readonly LearningEvent[]>;
}

export interface SearchPort {
  search(
    query: string,
    options?: { contentId?: string; limit?: number },
  ): Promise<
    readonly {
      contentId: string;
      locator: Locator;
      excerpt: string;
    }[]
  >;
}

export interface ResourcePackPort {
  install(manifest: ResourcePackManifest, source: Uint8Array): Promise<void>;
  uninstall(id: string): Promise<void>;
}
