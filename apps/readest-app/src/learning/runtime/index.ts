'use client';

import { useEffect, useState } from 'react';
import type { AppService } from '@/types/system';
import { getMigrations } from '@/services/database/migrations';
import { migrate } from '@/services/database/migrate';
import type { DatabaseService } from '@/types/database';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { useSettingsStore } from '@/store/settingsStore';
import {
  CapabilityPolicyAdapter,
  createActivityEngines,
  FsrsMemorySchedulerAdapter,
  PlatformAIProviderAdapter,
  ProviderEnforcedQuotaAdapter,
  ReadestLearningDatabaseAdapter,
  ReadestAIProviderAdapter,
  ReadestIdentityAdapter,
} from '../adapters';
import {
  ActivityPracticeService,
  AIExplainActionHandler,
  LearningOrchestrator,
} from '../application';
import {
  ActionRegistry,
  ActivityRegistry,
  ContractSchemaRegistry,
  ExecutionRuntime,
  PolicyRuntime,
  ProviderRouter,
} from '../kernel';
import type { AIProviderPort, IdentityPort } from '../ports';

export interface LearningRuntime {
  database: DatabaseService;
  repository: ReadestLearningDatabaseAdapter;
  orchestrator: LearningOrchestrator;
  activities: ActivityRegistry;
  practice: ActivityPracticeService;
  actions: ActionRegistry;
  providers: ProviderRouter<AIProviderPort>;
  execution: ExecutionRuntime;
  identity: IdentityPort;
  guestId: string;
}

const runtimes = new WeakMap<AppService, Promise<LearningRuntime>>();

export const createLearningRuntime = async (
  database: DatabaseService,
): Promise<LearningRuntime> => {
  await migrate(database, getMigrations('learning'));
  const repository = new ReadestLearningDatabaseAdapter(database);
  const guestId = await repository.getOrCreateGuestId(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `guest-${crypto.randomUUID()}`
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const identity = new ReadestIdentityAdapter({ identities: repository });
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
  const providers = new ProviderRouter<AIProviderPort>();
  providers.register(
    'ai.explain',
    new ReadestAIProviderAdapter(
      () => useSettingsStore.getState().settings.aiSettings ?? DEFAULT_AI_SETTINGS,
    ),
  );
  providers.register('ai.explain', new PlatformAIProviderAdapter());
  const execution = new ExecutionRuntime(
    actions,
    new ContractSchemaRegistry(),
    new PolicyRuntime(
      new CapabilityPolicyAdapter(['ai.explain']),
      new ProviderEnforcedQuotaAdapter(),
    ),
  );
  execution.register(
    'ai.explain',
    new AIExplainActionHandler({
      providers,
      cache: repository,
    }),
  );
  return {
    database,
    repository,
    activities,
    actions,
    providers,
    execution,
    identity,
    guestId,
    orchestrator: new LearningOrchestrator({
      lexicon: repository,
      memory: repository,
      scheduler: new FsrsMemorySchedulerAdapter(),
      plans: repository,
      events: repository,
    }),
    practice: new ActivityPracticeService({
      registry: activities,
      repository,
      events: repository,
    }),
  };
};

export const getLearningRuntime = (appService: AppService): Promise<LearningRuntime> => {
  const existing = runtimes.get(appService);
  if (existing) return existing;
  const runtime = appService
    .openDatabase('learning', 'learning.db', 'Data')
    .then(createLearningRuntime)
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
