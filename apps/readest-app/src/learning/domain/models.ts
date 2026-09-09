export type ISODateString = string;
export type LanguageTag = string;

export interface Locator {
  href: string;
  type?: string;
  title?: string;
  locations: {
    position?: number;
    progression?: number;
    totalProgression?: number;
    cfi?: string;
    cssSelector?: string;
    fragment?: string;
  };
  text?: {
    before?: string;
    highlight?: string;
    after?: string;
  };
}

export interface Provenance {
  source: string;
  version?: string;
  importedAt?: Date;
  sourceUrl?: string;
}

export type RightsClassification = 'private' | 'federated' | 'mirror' | 'quarantine';

export interface Rights {
  classification: RightsClassification;
  license?: string;
  owner?: string;
  expiresAt?: Date;
  restrictions?: readonly string[];
}

export interface ContentMetadata {
  title: string;
  authors: readonly string[];
  language?: LanguageTag;
  description?: string;
  identifiers?: Readonly<Record<string, string>>;
}

export interface ContentItem {
  id: string;
  metadata: ContentMetadata;
  currentVersionId: string;
  rights: Rights;
  provenance: Provenance;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  revision: number;
  fingerprint: string;
  createdAt: Date;
}

export interface ContentAsset {
  id: string;
  contentVersionId: string;
  role: 'source' | 'cover' | 'supplement' | 'transcript' | 'derived';
  mediaType: string;
  byteLength?: number;
  storageKey: string;
  checksum?: string;
}

export interface ContentSegment {
  id: string;
  contentVersionId: string;
  locator: Locator;
  text?: string;
  language?: LanguageTag;
}

export interface ContentRelation {
  id: string;
  sourceContentId: string;
  targetContentId: string;
  relation: 'translation' | 'edition' | 'companion' | 'derived-from' | 'part-of';
}

export interface Form {
  id: string;
  lexemeId: string;
  text: string;
  normalizedText: string;
  language: LanguageTag;
  formType: 'lemma' | 'inflection' | 'variant';
  createdAt: Date;
}

export interface Pronunciation {
  id: string;
  ownerId: string;
  system: 'ipa' | 'respelling' | 'audio';
  value: string;
  accent?: string;
}

export interface Lexeme {
  id: string;
  lemma: string;
  normalizedLemma: string;
  language: LanguageTag;
  partOfSpeech?: string;
  createdAt: Date;
}

export interface Sense {
  id: string;
  lexemeId: string;
  definition?: string;
  definitionLanguage?: LanguageTag;
  partOfSpeech?: string;
  status: 'unresolved' | 'resolved';
  createdAt: Date;
}

export interface Expression {
  id: string;
  text: string;
  language: LanguageTag;
  normalizedText: string;
  expressionType: 'expression' | 'sentence';
  createdAt: Date;
}

export interface LexicalGraph {
  lexeme?: Lexeme;
  forms: readonly Form[];
  sense?: Sense;
  expression?: Expression;
}

export type LearningObjectKind = 'word' | 'sense' | 'expression' | 'sentence';

export interface SavedLearningObject {
  id: string;
  kind: LearningObjectKind;
  text: string;
  normalizedText: string;
  language: LanguageTag;
  lexemeId?: string;
  senseId?: string;
  expressionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Occurrence {
  id: string;
  learningObjectId: string;
  contentId: string;
  contentVersionId: string;
  locator: Locator;
  contextText: string;
  createdAt: Date;
}

export interface Annotation {
  id: string;
  contentId: string;
  contentVersionId: string;
  locator: Locator;
  motivation: 'highlighting' | 'commenting' | 'bookmarking' | 'classifying';
  body?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityKind = 'recognition' | 'typing' | 'spelling' | 'cloze';

export interface ActivitySpec {
  id: string;
  kind: ActivityKind;
  learningObjectId: string;
  prompt: string;
  answer: string;
  sourceLocator?: Locator;
}

export interface ActivityAttempt {
  id: string;
  activityId: string;
  learningObjectId: string;
  response: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ActivityResult {
  attemptId: string;
  correct: boolean;
  score: number;
  durationMs: number;
  completedAt: Date;
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type MemoryState = 'new' | 'learning' | 'review' | 'relearning';

export interface ReviewPolicy {
  id: string;
  scheduler: string;
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzzing: boolean;
}

export interface ReviewItem {
  id: string;
  learningObjectId: string;
  policyId: string;
  createdAt: Date;
}

export interface MemoryReviewEvent {
  id: string;
  reviewItemId: string;
  attemptKey: string;
  rating: ReviewRating;
  occurredAt: Date;
}

export interface Schedule {
  reviewItemId: string;
  dueAt: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  state: MemoryState;
  elapsedDays?: number;
  learningSteps?: number;
  reps?: number;
  lapses?: number;
  lastReviewAt?: Date;
}

export type TodayPlanItem =
  | { id: string; kind: 'review'; reviewItemId: string; dueAt: Date }
  | { id: string; kind: 'continue-reading'; contentId: string; locator?: Locator }
  | { id: string; kind: 'recent-save'; learningObjectId: string; createdAt: Date }
  | { id: string; kind: 'optional-practice'; learningObjectId: string; activity: ActivityKind };

export interface TodayPlan {
  id: string;
  date: string;
  items: readonly TodayPlanItem[];
  generatedAt: Date;
}

export const LEARNING_EVENT_CONTRACT_VERSION = '1.0.0' as const;
export const TELEMETRY_EVENT_CONTRACT_VERSION = '1.0.0' as const;

export type LearningEventType =
  | 'learning_object_saved'
  | 'activity_completed'
  | 'memory_review_completed'
  | 'source_context_returned';

interface LearningEventEnvelope<TType extends LearningEventType, TProperties> {
  id: string;
  contractVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  type: TType;
  occurredAt: Date;
  clientSessionId: string;
  actorId?: string;
  aggregateId?: string;
  properties: Readonly<TProperties>;
}

export type LearningEvent =
  | LearningEventEnvelope<
      'learning_object_saved',
      {
        objectType: LearningObjectKind;
        saveMode: 'save' | 'save_and_practice';
        contentId: string;
        memorySubjectId: string;
      }
    >
  | LearningEventEnvelope<
      'activity_completed',
      {
        activityType: ActivityKind;
        resultBucket: 'correct' | 'incorrect';
        attemptId: string;
        memorySubjectId: string;
      }
    >
  | LearningEventEnvelope<
      'memory_review_completed',
      {
        memorySubjectId: string;
        ratingClass: ReviewRating;
        dueDeltaBucket: 'early' | 'on_time' | 'late' | 'unknown';
        reviewEventId: string;
      }
    >
  | LearningEventEnvelope<
      'source_context_returned',
      {
        contentId: string;
        locatorType: 'cfi' | 'css_selector' | 'fragment' | 'progression' | 'unknown';
        memorySubjectId: string;
      }
    >;

export interface TelemetryEvent {
  id: string;
  contractVersion: typeof TELEMETRY_EVENT_CONTRACT_VERSION;
  name: string;
  occurredAt: Date;
  clientSessionId: string;
  actorId?: string;
  properties: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SelectionContext {
  contentId: string;
  contentVersionId: string;
  text: string;
  language: LanguageTag;
  locator: Locator;
}

export interface Artifact {
  id: string;
  actionId: string;
  selection: SelectionContext;
  kind: 'dictionary' | 'translation' | 'explanation' | 'grammar' | 'note';
  content: string;
  language: LanguageTag;
  provider: ProviderMetadata;
  createdAt: Date;
}

export interface ActionDefinition {
  id: string;
  capability: string;
  title: string;
  inputKinds: readonly LearningObjectKind[];
  outputKind: Artifact['kind'];
}

export interface ActionExecution {
  id: string;
  actionId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  selection: SelectionContext;
  artifact?: Artifact;
  errorCode?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ProviderMetadata {
  id: string;
  version: string;
  model?: string;
  region?: string;
}

export interface ResourcePackManifest {
  id: string;
  version: string;
  contractVersion: string;
  kind: 'dictionary' | 'course' | 'activity' | 'content';
  language?: LanguageTag;
  checksum: string;
  license: string;
  provenance: Provenance;
}

export interface Entitlement {
  id: string;
  subjectId: string;
  capability: string;
  limit?: number;
  validFrom: Date;
  validUntil?: Date;
}

export interface UsageLedger {
  id: string;
  subjectId: string;
  capability: string;
  quantity: number;
  occurredAt: Date;
  idempotencyKey: string;
}

export interface BillingAccount {
  id: string;
  subjectId: string;
  status: 'beta' | 'active' | 'suspended' | 'closed';
}

export interface Product {
  id: string;
  name: string;
  capabilities: readonly string[];
}

export interface Price {
  id: string;
  productId: string;
  currency: string;
  amountMinor: number;
  interval?: 'month' | 'year';
}

export interface Subscription {
  id: string;
  billingAccountId: string;
  priceId: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
}

export interface PaymentTransaction {
  id: string;
  billingAccountId: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
}

export interface WebhookEvent {
  id: string;
  provider: string;
  type: string;
  receivedAt: Date;
}
