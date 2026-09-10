import { z } from 'zod';
import { LEARNING_SYNC_CONTRACT_VERSION } from '../domain';
import { learningEventSchema, locatorSchema } from './schemas';

const dateSchema = z.coerce.date();
const learningObjectKindSchema = z.enum(['word', 'sense', 'expression', 'sentence']);
const idSchema = z.string().min(1).max(512);

const learningObjectSchema = z.strictObject({
  id: idSchema,
  kind: learningObjectKindSchema,
  text: z.string(),
  normalizedText: z.string(),
  language: z.string().min(1),
  lexemeId: idSchema.optional(),
  senseId: idSchema.optional(),
  expressionId: idSchema.optional(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

const identitySchema = z.strictObject({
  kind: learningObjectKindSchema,
  language: z.string().min(1),
  normalizedText: z.string(),
});

const lexemeSchema = z.strictObject({
  id: idSchema,
  lemma: z.string(),
  normalizedLemma: z.string(),
  language: z.string().min(1),
  partOfSpeech: z.string().optional(),
  createdAt: dateSchema,
});

const formSchema = z.strictObject({
  id: idSchema,
  lexemeId: idSchema,
  text: z.string(),
  normalizedText: z.string(),
  language: z.string().min(1),
  formType: z.enum(['lemma', 'inflection', 'variant']),
  createdAt: dateSchema,
});

const senseSchema = z.strictObject({
  id: idSchema,
  lexemeId: idSchema,
  definition: z.string().optional(),
  definitionLanguage: z.string().optional(),
  partOfSpeech: z.string().optional(),
  status: z.enum(['unresolved', 'resolved']),
  createdAt: dateSchema,
});

const expressionSchema = z.strictObject({
  id: idSchema,
  text: z.string(),
  normalizedText: z.string(),
  language: z.string().min(1),
  expressionType: z.enum(['expression', 'sentence']),
  createdAt: dateSchema,
});

const occurrenceSchema = z.strictObject({
  id: idSchema,
  learningObjectId: idSchema,
  contentId: idSchema,
  contentVersionId: idSchema,
  locator: locatorSchema,
  contextText: z.string(),
  createdAt: dateSchema,
});

export const lexiconSyncPayloadSchema = z.strictObject({
  learningObject: learningObjectSchema,
  graph: z.strictObject({
    lexeme: lexemeSchema.optional(),
    forms: z.array(formSchema),
    sense: senseSchema.optional(),
    expression: expressionSchema.optional(),
  }),
  // One immutable occurrence fact per replica row prevents concurrent devices
  // from replacing an ever-growing aggregate through field-level LWW merge.
  occurrences: z.array(occurrenceSchema).length(1),
});

const reviewItemSchema = z.strictObject({
  id: idSchema,
  learningObjectId: idSchema,
  policyId: idSchema,
  createdAt: dateSchema,
});

const reviewEventSchema = z.strictObject({
  id: idSchema,
  reviewItemId: idSchema,
  attemptKey: idSchema,
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  occurredAt: dateSchema,
});

export const memorySyncPayloadSchema = z.strictObject({
  learningObject: identitySchema,
  reviewItem: reviewItemSchema,
  // A seed row may contain no event; every reviewed attempt gets its own row.
  reviewEvents: z.array(reviewEventSchema).max(1),
});

const activitySpecSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['recognition', 'typing', 'spelling', 'cloze']),
  learningObjectId: idSchema,
  prompt: z.string(),
  answer: z.string(),
  sourceLocator: locatorSchema.optional(),
});

const activityAttemptSchema = z.strictObject({
  id: idSchema,
  activityId: idSchema,
  learningObjectId: idSchema,
  response: z.string(),
  startedAt: dateSchema,
  completedAt: dateSchema.optional(),
});

const activityResultSchema = z.strictObject({
  attemptId: idSchema,
  correct: z.boolean(),
  score: z.number().min(0).max(1),
  durationMs: z.number().int().nonnegative(),
  completedAt: dateSchema,
});

export const activitySyncPayloadSchema = z.strictObject({
  learningObject: identitySchema,
  spec: activitySpecSchema,
  attempts: z
    .array(z.strictObject({ attempt: activityAttemptSchema, result: activityResultSchema }))
    .max(1),
});

export const parseLearningEventSyncPayload = (value: unknown) => {
  const wrapper = z
    .strictObject({
      event: z.record(z.string(), z.unknown()),
      learningObject: identitySchema.optional(),
    })
    .parse(value);
  return {
    event: learningEventSchema.parse({
      ...wrapper.event,
      occurredAt: dateSchema.parse(wrapper.event['occurredAt']),
    }),
    ...(wrapper.learningObject ? { learningObject: wrapper.learningObject } : {}),
  };
};

export const learningSyncRecordSchema = z.strictObject({
  id: idSchema,
  category: z.enum([
    'learning.lexicon',
    'learning.memory',
    'learning.activity',
    'learning.events',
  ]),
  contractVersion: z.literal(LEARNING_SYNC_CONTRACT_VERSION),
  updatedAt: z.iso.datetime(),
  payload: z.unknown(),
  deletedAt: z.iso.datetime().optional(),
});
