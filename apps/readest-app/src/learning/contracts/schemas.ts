import { z } from 'zod';

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
