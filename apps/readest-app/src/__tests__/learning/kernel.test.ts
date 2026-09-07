import { describe, expect, it, vi } from 'vitest';
import {
  CapabilityRegistry,
  PluginLifecycle,
  PluginRegistry,
  type LearningPlugin,
} from '@/learning/kernel';
import { pluginManifestSchema } from '@/learning/contracts';

describe('learning kernel', () => {
  it('rejects duplicate registrations instead of silently changing ownership', () => {
    const registry = new CapabilityRegistry();
    registry.register('dictionary.lookup', { owner: 'dictionary.readest' });

    expect(() => registry.register('dictionary.lookup', { owner: 'dictionary.other' })).toThrow(
      'CapabilityRegistry: "dictionary.lookup" is already registered',
    );
  });

  it('runs the complete plugin lifecycle and disposes in reverse order', async () => {
    const calls: string[] = [];
    const makePlugin = (id: string): LearningPlugin => ({
      manifest: pluginManifestSchema.parse({
        id,
        version: '0.1.0',
        contractVersion: '1.0.0',
        tier: 'internal',
        capabilities: [`${id}.capability`],
        configurationSchema: {},
        permissions: [],
        supportedLocales: ['en'],
        dataAccess: ['local'],
        license: 'AGPL-3.0-only',
        provenance: { source: 'english-learning-os', version: '0.1.0' },
      }),
      load: vi.fn(async () => {
        calls.push(`load:${id}`);
      }),
      declare: vi.fn(async () => {
        calls.push(`declare:${id}`);
      }),
      register: vi.fn(async () => {
        calls.push(`register:${id}`);
      }),
      start: vi.fn(async () => {
        calls.push(`start:${id}`);
      }),
      health: vi.fn(async () => ({ status: 'healthy' as const })),
      dispose: vi.fn(async () => {
        calls.push(`dispose:${id}`);
      }),
    });
    const plugins = new PluginRegistry();
    plugins.register('first', makePlugin('first'));
    plugins.register('second', makePlugin('second'));

    const lifecycle = new PluginLifecycle(plugins, new CapabilityRegistry());
    await lifecycle.startAll();
    await lifecycle.disposeAll();

    expect(calls).toEqual([
      'load:first',
      'declare:first',
      'register:first',
      'start:first',
      'load:second',
      'declare:second',
      'register:second',
      'start:second',
      'dispose:second',
      'dispose:first',
    ]);
    expect(lifecycle.getState('first')).toBe('disposed');
  });

  it('refuses executable third-party plugins in the MVP contract', () => {
    expect(() =>
      pluginManifestSchema.parse({
        id: 'third-party.executable',
        version: '0.1.0',
        contractVersion: '1.0.0',
        tier: 'executable',
        capabilities: ['unsafe.execute'],
        configurationSchema: {},
        permissions: ['network'],
        supportedLocales: ['en'],
        dataAccess: ['remote'],
        license: 'MIT',
        provenance: { source: 'example/plugin', version: '0.1.0' },
      }),
    ).toThrow();
  });
});
