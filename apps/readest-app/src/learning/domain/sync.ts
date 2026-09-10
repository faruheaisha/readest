import type {
  ActivityAttempt,
  ActivityResult,
  ActivitySpec,
  LearningEvent,
  LexicalGraph,
  MemoryReviewEvent,
  Occurrence,
  ReviewItem,
  SavedLearningObject,
} from './models';

export const LEARNING_SYNC_CONTRACT_VERSION = '1.0.0' as const;

/**
 * Stable product-level categories. Transport adapters may map these ids to
 * provider-specific channel names, but those names never enter the domain.
 */
export type LearningSyncCategoryId =
  | 'learning.lexicon'
  | 'learning.memory'
  | 'learning.activity'
  | 'learning.events';

export type LearningSyncMergeStrategy = 'canonical-aggregate' | 'append-only';
export type LearningSyncPrivacy = 'private-encrypted';

export interface LearningSyncCategoryDescriptor {
  id: LearningSyncCategoryId;
  contractVersion: typeof LEARNING_SYNC_CONTRACT_VERSION;
  mergeStrategy: LearningSyncMergeStrategy;
  privacy: LearningSyncPrivacy;
  dependencies: readonly LearningSyncCategoryId[];
}

/**
 * A provider-neutral wire record. Payload validation and merge semantics stay
 * with the category adapter that owns the domain facts.
 */
export interface LearningSyncRecord {
  id: string;
  category: LearningSyncCategoryId;
  contractVersion: typeof LEARNING_SYNC_CONTRACT_VERSION;
  updatedAt: string;
  payload: unknown;
  deletedAt?: string;
}

export interface LearningObjectIdentity {
  kind: SavedLearningObject['kind'];
  language: string;
  normalizedText: string;
}

export interface LexiconSyncPayload {
  learningObject: SavedLearningObject;
  graph: LexicalGraph;
  occurrences: readonly Occurrence[];
}

export interface MemorySyncPayload {
  learningObject: LearningObjectIdentity;
  reviewItem: ReviewItem;
  reviewEvents: readonly MemoryReviewEvent[];
}

export interface ActivitySyncPayload {
  learningObject: LearningObjectIdentity;
  spec: ActivitySpec;
  attempts: readonly { attempt: ActivityAttempt; result: ActivityResult }[];
}

export interface LearningEventSyncPayload {
  event: LearningEvent;
  learningObject?: LearningObjectIdentity;
}

export type LearningSyncStatus = 'disabled' | 'idle' | 'syncing' | 'conflict' | 'error';

export interface LearningSyncResult {
  categories: readonly LearningSyncCategoryId[];
  pushed: number;
  pulled: number;
  applied: number;
  ignored: number;
}
