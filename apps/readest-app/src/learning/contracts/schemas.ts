import { z } from 'zod';
import { LEARNING_EVENT_CONTRACT_VERSION, TELEMETRY_EVENT_CONTRACT_VERSION } from '../domain';

export const languageTagSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u, 'Expected a BCP 47 language tag');

export const locatorSchema = z.strictObject({
  href: z.string().min(1),
  type: z.string().min(1).optional(),
  title: z.string().optional(),
  locations: z.strictObject({
    position: z.number().int().positive().optional(),
    progression: z.number().min(0).max(1).optional(),
    totalProgression: z.number().min(0).max(1).optional(),
    cfi: z.string().optional(),
    cssSelector: z.string().optional(),
    fragment: z.string().optional(),
  }),
  text: z
    .strictObject({
      before: z.string().optional(),
      highlight: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
});

export const selectionContextSchema = z.strictObject({
  contentId: z.string().min(1),
  contentVersionId: z.string().min(1),
  text: z.string().trim().min(1).max(20_000),
  language: languageTagSchema,
  locator: locatorSchema,
});

const eventEnvelopeShape = {
  id: z.string().min(1).max(200),
  occurredAt: z.date(),
  clientSessionId: z.string().min(1).max(200),
  actorId: z.string().min(1).max(200).optional(),
} as const;

const learningEventEnvelopeShape = {
  ...eventEnvelopeShape,
  contractVersion: z.literal(LEARNING_EVENT_CONTRACT_VERSION),
  aggregateId: z.string().min(1).max(200).optional(),
} as const;

export const learningEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...learningEventEnvelopeShape,
    type: z.literal('learning_object_saved'),
    properties: z.strictObject({
      objectType: z.enum(['word', 'sense', 'expression', 'sentence']),
      saveMode: z.enum(['save', 'save_and_practice']),
      contentId: z.string().min(1).max(200),
      memorySubjectId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...learningEventEnvelopeShape,
    type: z.literal('activity_completed'),
    properties: z.strictObject({
      activityType: z.enum(['recognition', 'typing', 'spelling', 'cloze']),
      resultBucket: z.enum(['correct', 'incorrect']),
      attemptId: z.string().min(1).max(200),
      memorySubjectId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...learningEventEnvelopeShape,
    type: z.literal('memory_review_completed'),
    properties: z.strictObject({
      memorySubjectId: z.string().min(1).max(200),
      ratingClass: z.enum(['again', 'hard', 'good', 'easy']),
      dueDeltaBucket: z.enum(['early', 'on_time', 'late', 'unknown']),
      reviewEventId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...learningEventEnvelopeShape,
    type: z.literal('source_context_returned'),
    properties: z.strictObject({
      contentId: z.string().min(1).max(200),
      locatorType: z.enum(['cfi', 'css_selector', 'fragment', 'progression', 'unknown']),
      memorySubjectId: z.string().min(1).max(200),
    }),
  }),
]);

const telemetryEnvelopeShape = {
  ...eventEnvelopeShape,
  contractVersion: z.literal(TELEMETRY_EVENT_CONTRACT_VERSION),
} as const;

const contentTypeSchema = z.string().min(1).max(80);
const contentIdSchema = z.string().min(1).max(200);
const durationSchema = z.number().int().nonnegative().max(86_400_000);

export const betaTelemetryEventSchema = z.discriminatedUnion('name', [
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('content_import_started'),
    properties: z.strictObject({
      contentType: contentTypeSchema,
      sizeBucket: z.enum(['tiny', 'small', 'medium', 'large', 'unknown']),
      method: z.enum(['local_file', 'url', 'clip', 'catalog', 'unknown']),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('content_import_completed'),
    properties: z.strictObject({
      contentId: contentIdSchema,
      contentType: contentTypeSchema,
      durationMs: durationSchema,
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('content_import_failed'),
    properties: z.strictObject({
      failureClass: z.enum([
        'unsupported',
        'parse_error',
        'network',
        'server_resource',
        'timeout',
        'storage',
        'user_cancel',
        'unknown',
      ]),
      stage: z.string().min(1).max(80),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('content_opened'),
    properties: z.strictObject({
      contentId: contentIdSchema,
      source: z.enum(['library', 'today', 'review', 'import', 'search', 'unknown']),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('context_action_completed'),
    properties: z.strictObject({
      actionType: z.enum(['dictionary', 'translation', 'ai_explain', 'grammar']),
      latencyMs: durationSchema,
      providerClass: z.enum(['local', 'byok', 'platform', 'external', 'unknown']),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('learning_object_saved'),
    properties: z.strictObject({
      objectType: z.enum(['word', 'sense', 'expression', 'sentence']),
      saveMode: z.enum(['save', 'save_and_practice']),
      contentId: contentIdSchema,
      memorySubjectId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('activity_completed'),
    properties: z.strictObject({
      activityType: z.enum(['recognition', 'typing', 'spelling', 'cloze']),
      resultBucket: z.enum(['correct', 'incorrect']),
      attemptId: z.string().min(1).max(200),
      memorySubjectId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('memory_review_completed'),
    properties: z.strictObject({
      memorySubjectId: z.string().min(1).max(200),
      ratingClass: z.enum(['again', 'hard', 'good', 'easy']),
      dueDeltaBucket: z.enum(['early', 'on_time', 'late', 'unknown']),
      reviewEventId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('source_context_returned'),
    properties: z.strictObject({
      contentId: contentIdSchema,
      locatorType: z.enum(['cfi', 'css_selector', 'fragment', 'progression', 'unknown']),
      memorySubjectId: z.string().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('today_plan_started'),
    properties: z.strictObject({
      activityType: z.enum(['review', 'continue_reading', 'recent_save', 'optional_practice']),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('feedback_submitted'),
    properties: z.strictObject({
      category: z.enum(['bug', 'friction', 'value', 'request', 'other']),
      route: z.string().min(1).max(256),
    }),
  }),
  z.strictObject({
    ...telemetryEnvelopeShape,
    name: z.literal('network_sample'),
    properties: z.strictObject({
      ttfbBucket: z.enum(['fast', 'acceptable', 'slow', 'failed', 'unknown']),
      apiLatencyBucket: z.enum(['fast', 'acceptable', 'slow', 'failed', 'unknown']),
      ispClass: z.string().min(1).max(80).optional(),
    }),
  }),
]);

export type BetaTelemetryEvent = z.infer<typeof betaTelemetryEventSchema>;

const semverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
const identifierSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);

export const pluginManifestSchema = z
  .strictObject({
    id: identifierSchema,
    version: semverSchema,
    contractVersion: semverSchema,
    tier: z.enum(['internal', 'resource-pack', 'executable']),
    capabilities: z.array(identifierSchema).min(1),
    configurationSchema: z.record(z.string(), z.unknown()),
    permissions: z.array(z.enum(['network', 'local-storage', 'cloud-storage', 'telemetry'])),
    supportedLocales: z.array(languageTagSchema).min(1),
    dataAccess: z.array(z.enum(['local', 'remote', 'content', 'learning-data'])),
    healthCheck: z.string().optional(),
    license: z.string().min(1),
    provenance: z.strictObject({
      source: z.string().min(1),
      version: z.string().optional(),
      sourceUrl: z.url().optional(),
    }),
  })
  .superRefine((manifest, context) => {
    if (manifest.tier === 'executable') {
      context.addIssue({
        code: 'custom',
        path: ['tier'],
        message: 'Executable third-party plugins are disabled for the MVP',
      });
    }
  });

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export const resourcePackManifestSchema = z.strictObject({
  id: identifierSchema,
  version: semverSchema,
  contractVersion: semverSchema,
  kind: z.enum(['dictionary', 'course', 'activity', 'content']),
  language: languageTagSchema.optional(),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  license: z.string().min(1),
  provenance: z.strictObject({
    source: z.string().min(1),
    version: z.string().optional(),
    sourceUrl: z.url().optional(),
  }),
});

export const feedbackSubmissionSchema = z
  .strictObject({
    guestId: z.string().min(1).max(128),
    message: z.string().trim().min(3).max(4_000),
    diagnosticConsent: z.boolean(),
    diagnostics: z
      .strictObject({
        route: z.string().max(256).optional(),
        locale: languageTagSchema.optional(),
        platform: z.enum(['web', 'windows', 'macos', 'linux', 'android', 'ios']).optional(),
        appVersion: z.string().max(64).optional(),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (!input.diagnosticConsent && input.diagnostics !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['diagnostics'],
        message: 'Diagnostics require explicit consent',
      });
    }
  });
