import type { LearningSyncCategoryId } from '@/learning/domain';

/** Single transport mapping shared by registration, gating, and orchestration. */
export const LEARNING_REPLICA_KINDS: Readonly<Record<LearningSyncCategoryId, string>> = {
  'learning.lexicon': 'learning_lexicon',
  'learning.memory': 'learning_memory',
  'learning.activity': 'learning_activity',
  'learning.events': 'learning_event',
};

const categoriesByKind = new Map(
  Object.entries(LEARNING_REPLICA_KINDS).map(([category, kind]) => [
    kind,
    category as LearningSyncCategoryId,
  ]),
);

export const getLearningCategoryForReplicaKind = (
  kind: string,
): LearningSyncCategoryId | undefined => categoriesByKind.get(kind);

export const isLearningReplicaKind = (kind: string): boolean => categoriesByKind.has(kind);
