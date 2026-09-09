import { describe, expect, it, vi } from 'vitest';
import {
  AIExplainActionHandler,
  DictionaryLookupActionHandler,
  InMemoryArtifactCacheAdapter,
  TranslationActionHandler,
} from '@/learning';
import {
  ActionRegistry,
  ContractSchemaRegistry,
  ExecutionRuntime,
  ProviderRouter,
} from '@/learning/kernel';
import type {
  AIProviderPort,
  DictionaryProviderPort,
  PolicyPort,
  QuotaPort,
  TelemetryPort,
  TranslationProviderPort,
} from '@/learning/ports';
import {
  TELEMETRY_EVENT_CONTRACT_VERSION,
  type Artifact,
  type SelectionContext,
  type TelemetryEvent,
} from '@/learning/domain';
import { PolicyRuntime, TelemetryRuntime } from '@/learning/kernel';

const selection: SelectionContext = {
  contentId: 'book-1',
  contentVersionId: 'book-1-v1',
  text: 'context matters',
  language: 'en',
  locator: {
    href: 'chapter-1.xhtml',
    locations: { cfi: 'epubcfi(/6/2!/4/2/1:0)' },
    text: { before: 'The ', highlight: 'context matters', after: ' here.' },
  },
};

const makeArtifact = (providerId: string, language: string): Artifact => ({
  id: `artifact-${providerId}-${language}`,
  actionId: 'ai.explain',
  selection,
  kind: 'explanation',
  content: `Explanation in ${language}`,
  language,
  provider: { id: providerId, version: '1.0.0', model: 'test-model' },
  createdAt: new Date('2026-09-08T12:00:00.000Z'),
});

describe('learning AI action runtime', () => {
  it('routes through a provider and reuses an Artifact only for the complete cache identity', async () => {
    const explain = vi.fn(async (_selection: SelectionContext, language: string) =>
      makeArtifact('readest-ai', language),
    );
    const provider: AIProviderPort = {
      promptVersion: 'explain-v1',
      describe: () => ({ id: 'readest-ai', version: '1.0.0', model: 'test-model' }),
      isAvailable: async () => true,
      explain,
    };
    const providers = new ProviderRouter<AIProviderPort>();
    providers.register('ai.explain', provider);
    const handler = new AIExplainActionHandler({
      providers,
      cache: new InMemoryArtifactCacheAdapter(),
    });

    const action = {
      id: 'ai.explain',
      capability: 'ai.explain',
      title: 'AI Explain',
      inputKinds: ['word', 'sense', 'expression', 'sentence'] as const,
      outputKind: 'explanation' as const,
    };
    const first = await handler.execute(selection, { action, locale: 'zh-CN' });
    const cached = await handler.execute(selection, { action, locale: 'zh-CN' });
    const otherLocale = await handler.execute(selection, { action, locale: 'en' });

    expect(cached).toBe(first);
    expect(otherLocale.language).toBe('en');
    expect(explain).toHaveBeenCalledTimes(2);
  });

  it('checks policy and quota before invoking the registered handler', async () => {
    const actions = new ActionRegistry();
    actions.register('ai.explain', {
      id: 'ai.explain',
      capability: 'ai.explain',
      title: 'AI Explain',
      inputKinds: ['word', 'sense', 'expression', 'sentence'],
      outputKind: 'explanation',
    });
    const policy: PolicyPort = { authorize: vi.fn(async () => true) };
    const quota: QuotaPort = { consume: vi.fn(async () => false) };
    const runtime = new ExecutionRuntime(
      actions,
      new ContractSchemaRegistry(),
      new PolicyRuntime(policy, quota),
    );
    const execute = vi.fn(async () => makeArtifact('readest-ai', 'zh-CN'));
    runtime.register('ai.explain', { execute });

    await expect(
      runtime.execute({
        actionId: 'ai.explain',
        selection,
        subjectId: 'user-1',
        idempotencyKey: 'attempt-1',
        locale: 'zh-CN',
      }),
    ).rejects.toThrow('not allowed');

    expect(policy.authorize).toHaveBeenCalledWith('user-1', 'ai.explain');
    expect(quota.consume).toHaveBeenCalledWith('user-1', 'ai.explain', 1, 'attempt-1');
    expect(execute).not.toHaveBeenCalled();
  });

  it('falls back to the next available provider without leaking provider configuration', async () => {
    const unavailable: AIProviderPort = {
      promptVersion: 'explain-v1',
      describe: () => ({ id: 'offline', version: '1.0.0' }),
      isAvailable: async () => false,
      explain: async () => makeArtifact('offline', 'en'),
    };
    const available: AIProviderPort = {
      promptVersion: 'explain-v1',
      describe: () => ({ id: 'configured', version: '1.0.0' }),
      isAvailable: async () => true,
      explain: async (_selection, language) => makeArtifact('configured', language),
    };
    const providers = new ProviderRouter<AIProviderPort>();
    providers.register('ai.explain', unavailable);
    providers.register('ai.explain', available);

    expect((await providers.resolve('ai.explain')).describe().id).toBe('configured');
  });

  it('records a privacy-safe context action without selected text', async () => {
    const actions = new ActionRegistry();
    actions.register('ai.explain', {
      id: 'ai.explain',
      capability: 'ai.explain',
      title: 'AI Explain',
      inputKinds: ['word', 'sense', 'expression', 'sentence'],
      outputKind: 'explanation',
    });
    const captured: TelemetryEvent[] = [];
    const telemetryPort: TelemetryPort = {
      capture: async (event) => {
        captured.push(event);
      },
    };
    const runtime = new ExecutionRuntime(
      actions,
      new ContractSchemaRegistry(),
      undefined,
      new TelemetryRuntime(telemetryPort),
    );
    runtime.register('ai.explain', {
      execute: async () => makeArtifact('english-learning-os.platform-ai', 'zh-CN'),
    });

    await runtime.execute({
      actionId: 'ai.explain',
      selection,
      subjectId: 'subject-1',
      idempotencyKey: 'action-1',
      clientSessionId: 'session-1',
      telemetryActorId: 'guest-1',
      locale: 'zh-CN',
    });

    expect(captured).toEqual([
      {
        id: 'telemetry:context-action:action-1',
        contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
        name: 'context_action_completed',
        occurredAt: expect.any(Date),
        clientSessionId: 'session-1',
        actorId: 'guest-1',
        properties: {
          actionType: 'ai_explain',
          latencyMs: expect.any(Number),
          providerClass: 'platform',
        },
      },
    ]);
    expect(JSON.stringify(captured)).not.toContain(selection.text);
  });
});

describe('learning translation action runtime', () => {
  it('routes translation through its provider and caches by the complete context', async () => {
    const translate = vi.fn(
      async (_selection: SelectionContext, language: string): Promise<Artifact> => ({
        ...makeArtifact('readest-translation', language),
        actionId: 'translation.translate',
        kind: 'translation',
        content: `Translation in ${language}`,
      }),
    );
    const provider: TranslationProviderPort = {
      resultVersion: 'translation-v1',
      describe: () => ({ id: 'readest-translation', version: '1.0.0' }),
      isAvailable: async () => true,
      translate,
    };
    const providers = new ProviderRouter<TranslationProviderPort>();
    providers.register('translation.execute', provider);
    const handler = new TranslationActionHandler({
      providers,
      cache: new InMemoryArtifactCacheAdapter(),
    });
    const action = {
      id: 'translation.translate',
      capability: 'translation.execute',
      title: 'Translation',
      inputKinds: ['word', 'sense', 'expression', 'sentence'] as const,
      outputKind: 'translation' as const,
    };

    const first = await handler.execute(selection, { action, locale: 'zh-CN' });
    const cached = await handler.execute(selection, { action, locale: 'zh-CN' });
    const otherLocale = await handler.execute(selection, { action, locale: 'ja' });

    expect(cached).toBe(first);
    expect(otherLocale.language).toBe('ja');
    expect(translate).toHaveBeenCalledTimes(2);
  });
});

describe('learning dictionary action runtime', () => {
  it('routes lookup through its provider and caches by provider set and selection', async () => {
    const lookup = vi.fn(
      async (): Promise<Artifact> => ({
        ...makeArtifact('readest-dictionary', 'en'),
        actionId: 'dictionary.lookup',
        kind: 'dictionary',
        content: 'A contextual definition.',
      }),
    );
    const provider: DictionaryProviderPort = {
      resultVersion: 'dictionary-v1',
      describe: () => ({
        id: 'readest-dictionary',
        version: '1.0.0',
        model: 'dictionary-a,dictionary-b',
      }),
      isAvailable: async () => true,
      lookup,
    };
    const providers = new ProviderRouter<DictionaryProviderPort>();
    providers.register('dictionary.lookup', provider);
    const handler = new DictionaryLookupActionHandler({
      providers,
      cache: new InMemoryArtifactCacheAdapter(),
    });
    const action = {
      id: 'dictionary.lookup',
      capability: 'dictionary.lookup',
      title: 'Meaning',
      inputKinds: ['word', 'sense', 'expression'] as const,
      outputKind: 'dictionary' as const,
    };

    const first = await handler.execute(selection, { action });
    const cached = await handler.execute(selection, { action });

    expect(cached).toBe(first);
    expect(lookup).toHaveBeenCalledOnce();
  });
});
