'use client';

import { useEffect, useState } from 'react';
import type { AppService } from '@/types/system';
import { getMigrations } from '@/services/database/migrations';
import { migrate } from '@/services/database/migrate';
import type { DatabaseService } from '@/types/database';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { useSettingsStore } from '@/store/settingsStore';
import { useCustomDictionaryStore } from '@/store/customDictionaryStore';
import { getEnabledProviders } from '@/services/dictionaries/registry';
import {
  CapabilityPolicyAdapter,
  createActivityEngines,
  FsrsMemorySchedulerAdapter,
  HttpFeedbackAdapter,
  LearningEventRuntimeAdapter,
  PlatformAIProviderAdapter,
  ProviderEnforcedQuotaAdapter,
  ReadestLearningDatabaseAdapter,
  ReadestAIProviderAdapter,
  ReadestDictionaryProviderAdapter,
  ReadestIdentityAdapter,
  ReadestTelemetryAdapter,
  ReadestTranslationProviderAdapter,
} from '../adapters';
import {
  ActivityPracticeService,
  AIExplainActionHandler,
  DictionaryLookupActionHandler,
  LearningOrchestrator,
  TranslationActionHandler,
} from '../application';
import {
  ActionRegistry,
  ActivityRegistry,
  ContractSchemaRegistry,
  EventRuntime,
  ExecutionRuntime,
  PolicyRuntime,
  ProviderRouter,
  TelemetryRuntime,
} from '../kernel';
import { TELEMETRY_EVENT_CONTRACT_VERSION } from '../domain';
import type {
  AIProviderPort,
  DictionaryProviderPort,
  FeedbackPort,
  IdentityPort,
  LearningEventPort,
  TranslationProviderPort,
} from '../ports';

export interface LearningRuntime {
  database: DatabaseService;
  repository: ReadestLearningDatabaseAdapter;
  orchestrator: LearningOrchestrator;
  activities: ActivityRegistry;
  practice: ActivityPracticeService;
  actions: ActionRegistry;
  aiProviders: ProviderRouter<AIProviderPort>;
  dictionaryProviders: ProviderRouter<DictionaryProviderPort>;
  translationProviders: ProviderRouter<TranslationProviderPort>;
  execution: ExecutionRuntime;
  events: LearningEventPort;
  telemetry: TelemetryRuntime;
  identity: IdentityPort;
  feedback: FeedbackPort;
  guestId: string;
  clientSessionId: string;
}

const runtimes = new WeakMap<AppService, Promise<LearningRuntime>>();
const CLIENT_SESSION_KEY = 'english-learning-os:client-session-id';

const getClientSessionId = (): string => {
  const candidate =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (typeof window === 'undefined') return `server-${candidate}`;
  const existing = window.sessionStorage.getItem(CLIENT_SESSION_KEY);
  if (existing) return existing;
  const created = `session-${candidate}`;
  window.sessionStorage.setItem(CLIENT_SESSION_KEY, created);
  return created;
};

export const createLearningRuntime = async (
  database: DatabaseService,
  appService: AppService,
): Promise<LearningRuntime> => {
  await migrate(database, getMigrations('learning'));
  const repository = new ReadestLearningDatabaseAdapter(database);
  const guestId = await repository.getOrCreateGuestId(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `guest-${crypto.randomUUID()}`
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const identity = new ReadestIdentityAdapter({ identities: repository });
  const clientSessionId = getClientSessionId();
  const eventContext = () => ({ clientSessionId, actorId: guestId });
  const telemetry = new TelemetryRuntime(new ReadestTelemetryAdapter());
  const eventRuntime = new EventRuntime();
  const events = new LearningEventRuntimeAdapter(repository, eventRuntime);
  for (const type of [
    'learning_object_saved',
    'activity_completed',
    'memory_review_completed',
    'source_context_returned',
  ] as const) {
    eventRuntime.subscribe(type, (event) =>
      telemetry.capture({
        id: `telemetry:${event.id}`,
        contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
        name: event.type,
        occurredAt: event.occurredAt,
        clientSessionId: event.clientSessionId,
        ...(event.actorId ? { actorId: event.actorId } : {}),
        properties: event.properties,
      }),
    );
  }
  const feedback = new HttpFeedbackAdapter({
    guestId: () => guestId,
    accessToken: () =>
      typeof window === 'undefined' ? null : window.localStorage.getItem('token'),
  });
  const activities = new ActivityRegistry();
  for (const engine of createActivityEngines()) activities.registerEngine(engine);
  const actions = new ActionRegistry();
  actions.register('ai.explain', {
    id: 'ai.explain',
    capability: 'ai.explain',
    title: 'AI Explain',
    inputKinds: ['word', 'sense', 'expression', 'sentence'],
    outputKind: 'explanation',
  });
  actions.register('translation.translate', {
    id: 'translation.translate',
    capability: 'translation.execute',
    title: 'Translation',
    inputKinds: ['word', 'sense', 'expression', 'sentence'],
    outputKind: 'translation',
  });
  actions.register('dictionary.lookup', {
    id: 'dictionary.lookup',
    capability: 'dictionary.lookup',
    title: 'Meaning',
    inputKinds: ['word', 'sense', 'expression'],
    outputKind: 'dictionary',
  });
  const aiProviders = new ProviderRouter<AIProviderPort>();
  aiProviders.register(
    'ai.explain',
    new ReadestAIProviderAdapter(
      () => useSettingsStore.getState().settings.aiSettings ?? DEFAULT_AI_SETTINGS,
    ),
  );
  aiProviders.register('ai.explain', new PlatformAIProviderAdapter());
  const translationProviders = new ProviderRouter<TranslationProviderPort>();
  translationProviders.register(
    'translation.execute',
    new ReadestTranslationProviderAdapter(() => useSettingsStore.getState().settings),
  );
  const dictionaryProviders = new ProviderRouter<DictionaryProviderPort>();
  dictionaryProviders.register(
    'dictionary.lookup',
    new ReadestDictionaryProviderAdapter(() => {
      const { dictionaries, settings } = useCustomDictionaryStore.getState();
      return getEnabledProviders({ settings, dictionaries, fs: appService });
    }),
  );
  const execution = new ExecutionRuntime(
    actions,
    new ContractSchemaRegistry(),
    new PolicyRuntime(
      new CapabilityPolicyAdapter(['ai.explain', 'translation.execute', 'dictionary.lookup']),
      new ProviderEnforcedQuotaAdapter(),
    ),
    telemetry,
  );
  execution.register(
    'ai.explain',
    new AIExplainActionHandler({
      providers: aiProviders,
      cache: repository,
    }),
  );
  execution.register(
    'translation.translate',
    new TranslationActionHandler({
      providers: translationProviders,
      cache: repository,
    }),
  );
  execution.register(
    'dictionary.lookup',
    new DictionaryLookupActionHandler({
      providers: dictionaryProviders,
      cache: repository,
    }),
  );
  return {
    database,
    repository,
    activities,
    actions,
    aiProviders,
    dictionaryProviders,
    translationProviders,
    execution,
    events,
    telemetry,
    identity,
    feedback,
    guestId,
    clientSessionId,
    orchestrator: new LearningOrchestrator({
      lexicon: repository,
      memory: repository,
      scheduler: new FsrsMemorySchedulerAdapter(),
      plans: repository,
      events,
      eventContext,
    }),
    practice: new ActivityPracticeService({
      registry: activities,
      repository,
      events,
      eventContext,
    }),
  };
};

export const getLearningRuntime = (appService: AppService): Promise<LearningRuntime> => {
  const existing = runtimes.get(appService);
  if (existing) return existing;
  const runtime = appService
    .openDatabase('learning', 'learning.db', 'Data')
    .then((database) => createLearningRuntime(database, appService))
    .catch((error: unknown) => {
      runtimes.delete(appService);
      throw error;
    });
  runtimes.set(appService, runtime);
  return runtime;
};

export const useLearningRuntime = (
  appService: AppService | null,
): { runtime: LearningRuntime | null; loading: boolean; error: Error | null } => {
  const [runtime, setRuntime] = useState<LearningRuntime | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!appService) return;
    let cancelled = false;
    void getLearningRuntime(appService)
      .then((value) => {
        if (!cancelled) setRuntime(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      });
    return () => {
      cancelled = true;
    };
  }, [appService]);

  return { runtime, loading: appService !== null && runtime === null && error === null, error };
};
