'use client';

import { useEffect, useState } from 'react';
import type { AppService } from '@/types/system';
import { getMigrations } from '@/services/database/migrations';
import { migrate } from '@/services/database/migrate';
import type { DatabaseService } from '@/types/database';
import { FsrsMemorySchedulerAdapter, ReadestLearningDatabaseAdapter } from '../adapters';
import { LearningOrchestrator } from '../application';

export interface LearningRuntime {
  database: DatabaseService;
  repository: ReadestLearningDatabaseAdapter;
  orchestrator: LearningOrchestrator;
}

const runtimes = new WeakMap<AppService, Promise<LearningRuntime>>();

export const createLearningRuntime = async (
  database: DatabaseService,
): Promise<LearningRuntime> => {
  await migrate(database, getMigrations('learning'));
  const repository = new ReadestLearningDatabaseAdapter(database);
  return {
    database,
    repository,
    orchestrator: new LearningOrchestrator({
      lexicon: repository,
      memory: repository,
      scheduler: new FsrsMemorySchedulerAdapter(),
      plans: repository,
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
