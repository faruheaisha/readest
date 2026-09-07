import { pluginManifestSchema, type PluginManifest } from '../contracts';

const internalPlugin = (
  id: string,
  capabilities: readonly string[],
  options: {
    permissions?: readonly ('network' | 'local-storage' | 'cloud-storage' | 'telemetry')[];
    dataAccess?: readonly ('local' | 'remote' | 'content' | 'learning-data')[];
    source?: string;
    license?: string;
  } = {},
): PluginManifest =>
  pluginManifestSchema.parse({
    id,
    version: '0.1.0',
    contractVersion: '1.0.0',
    tier: 'internal',
    capabilities,
    configurationSchema: {},
    permissions: options.permissions ?? [],
    supportedLocales: ['en', 'zh-CN'],
    dataAccess: options.dataAccess ?? ['local'],
    license: options.license ?? 'AGPL-3.0-only',
    provenance: { source: options.source ?? 'english-learning-os', version: '0.1.0' },
  });

export const learningPluginCatalog: readonly PluginManifest[] = [
  internalPlugin('reader.readest', ['content.read', 'content.locate'], {
    dataAccess: ['local', 'content'],
    source: 'readest/readest',
  }),
  internalPlugin('dictionary.readest', ['dictionary.lookup'], {
    dataAccess: ['local', 'content'],
    source: 'readest/readest',
  }),
  internalPlugin('translation.readest', ['translation.execute'], {
    permissions: ['network'],
    dataAccess: ['local', 'remote', 'content'],
    source: 'readest/readest',
  }),
  internalPlugin('ai.openai-compatible', ['ai.explain', 'ai.grammar'], {
    permissions: ['network'],
    dataAccess: ['local', 'remote', 'content'],
    source: 'readest/readest',
  }),
  internalPlugin('activity.recognition', ['activity.recognition'], {
    dataAccess: ['learning-data'],
  }),
  internalPlugin('activity.qwerty-typing', ['activity.typing'], { dataAccess: ['learning-data'] }),
  internalPlugin('activity.spelling', ['activity.spelling'], { dataAccess: ['learning-data'] }),
  internalPlugin('activity.cloze', ['activity.cloze'], { dataAccess: ['learning-data'] }),
  internalPlugin('memory.fsrs', ['memory.schedule'], {
    dataAccess: ['learning-data'],
    source: 'open-spaced-repetition/ts-fsrs',
    license: 'MIT',
  }),
  internalPlugin('storage.local', ['storage.local'], {
    permissions: ['local-storage'],
    dataAccess: ['local', 'content', 'learning-data'],
    source: 'readest/readest',
  }),
  internalPlugin('storage.s3-compatible', ['storage.cloud'], {
    permissions: ['network', 'cloud-storage'],
    dataAccess: ['remote', 'content', 'learning-data'],
    source: 'readest/readest',
  }),
  internalPlugin('sync.readest-replica', ['sync.replica'], {
    permissions: ['network', 'cloud-storage'],
    dataAccess: ['local', 'remote', 'learning-data'],
    source: 'readest/readest',
  }),
  internalPlugin('identity.email-password', ['identity.email-password'], {
    permissions: ['network'],
    dataAccess: ['remote'],
  }),
  internalPlugin('telemetry.otel', ['telemetry.capture'], {
    permissions: ['network', 'telemetry'],
    dataAccess: ['remote'],
  }),
  internalPlugin('entitlement.beta-grant', ['entitlement.resolve'], {
    dataAccess: ['local', 'learning-data'],
  }),
];
