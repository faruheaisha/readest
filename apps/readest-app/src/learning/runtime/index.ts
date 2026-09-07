'use client';

import { useEffect, useState } from 'react';
import type { AppService } from '@/types/system';
import { getMigrations } from '@/services/database/migrations';
import { migrate } from '@/services/database/migrate';
import type { DatabaseService } from '@/types/database';
import {
  createActivityEngines,
  FsrsMemorySchedulerAdapter,
  ReadestLearningDatabaseAdapter,
} from '../adapters';
import { ActivityPracticeService, LearningOrchestrator } from '../application';
import { ActivityRegistry } from '../kernel';

export interface LearningRuntime {
  database: DatabaseService;
  repository: ReadestLearningDatabaseAdapter;
  orchestrator: LearningOrchestrator;
  activities: ActivityRegistry;
  practice: ActivityPracticeService;
}

const runtimes = new WeakMap<AppService, Promise<LearningRuntime>>();

export const createLearningRuntime = async (
  database: DatabaseService,
): Promise<LearningRuntime> => {
  await migrate(database, getMigrations('learning'));
  const repository = new ReadestLearningDatabaseAdapter(database);
  const activities = new ActivityRegistry();
  for (const engine of createActivityEngines()) activities.registerEngine(engine);
  return {
    database,
    repository,
    activities,
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
