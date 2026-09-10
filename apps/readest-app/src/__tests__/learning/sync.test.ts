import { describe, expect, it } from 'vitest';
import {
  InMemoryActivityAdapter,
  InMemoryLearningEventAdapter,
  InMemoryLearningPlanAdapter,
  InMemoryLexiconAdapter,
  InMemoryMemoryAdapter,
} from '@/learning/adapters/in-memory';
import { FsrsMemorySchedulerAdapter } from '@/learning/adapters/fsrs';
import { InMemoryLearningSyncTransport } from '@/learning/adapters/in-memory-sync';
import {
  ActivitySyncCategoryAdapter,
  LearningEventSyncCategoryAdapter,
  LexiconSyncCategoryAdapter,
  MemorySyncCategoryAdapter,
} from '@/learning/adapters/sync-categories';
import { LearningOrchestrator } from '@/learning/application/orchestrator';
import { LearningSyncService } from '@/learning/application/sync';
import { SyncCategoryRegistry } from '@/learning/kernel/registry';
import type { ActivityAttempt, ActivityResult, ActivitySpec, SelectionContext } from '@/learning/domain';

const selection = (text: string, contentId: string): SelectionContext => ({
  contentId,
  contentVersionId: `${contentId}:source`,
  text,
  language: 'en',
  locator: {
    href: '/chapter-1',
    locations: { progression: 0.25 },
    text: { highlight: text },
  },
});

const createRuntimeParts = (idPrefix = 'id') => {
  const lexicon = new InMemoryLexiconAdapter();
  const memory = new InMemoryMemoryAdapter();
  const activities = new InMemoryActivityAdapter();
  const scheduler = new FsrsMemorySchedulerAdapter();
  const events = new InMemoryLearningEventAdapter();
  const plans = new InMemoryLearningPlanAdapter();
  let sequence = 0;
  const orchestrator = new LearningOrchestrator({
    lexicon,
    memory,
    scheduler,
    events,
    plans,
    now: () => new Date('2026-09-09T12:00:00.000Z'),
    createId: () => `${idPrefix}-${++sequence}`,
  });
  const categories = new SyncCategoryRegistry();
  categories.registerCategory(new LexiconSyncCategoryAdapter(lexicon));
  categories.registerCategory(new MemorySyncCategoryAdapter(lexicon, memory, scheduler));
  categories.registerCategory(new ActivitySyncCategoryAdapter(lexicon, activities));
  categories.registerCategory(new LearningEventSyncCategoryAdapter(lexicon, memory, events));
  return { lexicon, memory, activities, scheduler, events, orchestrator, categories };
};

describe('learning sync', () => {
  it('orders dependencies, converges canonical ids, and rebuilds schedules from review events', async () => {
    const source = createRuntimeParts('source');
    const saved = await source.orchestrator.saveSelection(selection('Synapse', 'paper-a'), 'word');
    await source.orchestrator.saveSelection(selection('Synapse', 'paper-b'), 'word');
    const item = await source.orchestrator.ensureReviewItem(saved.learningObject.id);
    await source.orchestrator.submitReview(item.id, 'good', 'attempt-source-1');

    const spec: ActivitySpec = {
      id: 'spec-source',
      kind: 'typing',
      learningObjectId: saved.learningObject.id,
      prompt: 'Type the word',
      answer: 'Synapse',
    };
    const attempt: ActivityAttempt = {
      id: 'activity-attempt-1',
      activityId: spec.id,
      learningObjectId: saved.learningObject.id,
      response: 'Synapse',
      startedAt: new Date('2026-09-09T12:01:00.000Z'),
      completedAt: new Date('2026-09-09T12:01:02.000Z'),
    };
    const result: ActivityResult = {
      attemptId: attempt.id,
      correct: true,
      score: 1,
      durationMs: 2000,
      completedAt: attempt.completedAt!,
    };
    await source.activities.saveSpec(spec);
    await source.activities.saveAttempt(attempt, result);

    const target = createRuntimeParts('target');
    const existing = await target.orchestrator.saveSelection(
      selection('Synapse', 'textbook-b'),
      'word',
    );
    expect(existing.learningObject.id).not.toBe(saved.learningObject.id);

    const transport = new InMemoryLearningSyncTransport();
    const sourceSync = new LearningSyncService({ categories: source.categories, transport });
    const targetSync = new LearningSyncService({ categories: target.categories, transport });

    expect(await sourceSync.publish()).toBe(6);
    const first = await targetSync.pull(['learning.memory', 'learning.activity']);
    expect(first).toEqual({ pulled: 4, applied: 4, ignored: 0 });

    const canonical = await target.lexicon.findLearningObject({
      kind: 'word',
      language: 'en',
      normalizedText: 'synapse',
    });
    expect(canonical?.id).toBe(existing.learningObject.id);
    expect(await target.lexicon.listOccurrences(canonical!.id)).toHaveLength(3);

    const targetItem = await target.memory.findReviewItemByLearningObject(canonical!.id);
    expect(targetItem).not.toBeNull();
    expect(await target.memory.listReviewEvents(targetItem!.id)).toHaveLength(1);
    expect(await target.memory.getSchedule(targetItem!.id)).toMatchObject({
      reviewItemId: targetItem!.id,
      state: 'learning',
    });

    const targetSpec = await target.activities.findSpecByLearningObject(canonical!.id, 'typing');
    expect(targetSpec).not.toBeNull();
    expect(await target.activities.listAttempts(targetSpec!.id)).toHaveLength(1);

    const repeated = await targetSync.pull(['learning.activity', 'learning.memory']);
    expect(repeated).toEqual({ pulled: 4, applied: 0, ignored: 4 });

    const eventPull = await targetSync.pull(['learning.events']);
    expect(eventPull).toEqual({ pulled: 5, applied: 2, ignored: 3 });
    const sourceEvents = (await target.events.list()).filter(({ id }) => id.startsWith('source-'));
    expect(sourceEvents).toHaveLength(1);
    expect(sourceEvents[0]?.properties.memorySubjectId).toBe(canonical!.id);
    const reviewEvent = (await target.events.list()).find(
      ({ type }) => type === 'memory_review_completed',
    );
    expect(reviewEvent?.properties.memorySubjectId).toBe(canonical!.id);
    expect(reviewEvent?.aggregateId).toBe(targetItem!.id);
  });

  it('does not make schedules, Today projections, artifacts, or telemetry transport categories', () => {
    const runtime = createRuntimeParts();
    expect(runtime.categories.values().map(({ descriptor }) => descriptor)).toEqual([
      expect.objectContaining({ id: 'learning.lexicon', mergeStrategy: 'canonical-aggregate' }),
      expect.objectContaining({
        id: 'learning.memory',
        mergeStrategy: 'append-only',
        dependencies: ['learning.lexicon'],
      }),
      expect.objectContaining({
        id: 'learning.activity',
        mergeStrategy: 'append-only',
        dependencies: ['learning.lexicon'],
      }),
      expect.objectContaining({
        id: 'learning.events',
        mergeStrategy: 'append-only',
        dependencies: ['learning.lexicon', 'learning.memory'],
      }),
    ]);
  });

  it('rejects duplicate categories and dependency cycles', () => {
    const runtime = createRuntimeParts();
    expect(() =>
      runtime.categories.registerCategory(new LexiconSyncCategoryAdapter(runtime.lexicon)),
    ).toThrow('SyncCategoryRegistry: "learning.lexicon" is already registered');

    const cyclic = new SyncCategoryRegistry();
    cyclic.registerCategory({
      descriptor: {
        id: 'learning.lexicon',
        contractVersion: '1.0.0',
        mergeStrategy: 'canonical-aggregate',
        privacy: 'private-encrypted',
        dependencies: ['learning.memory'],
      },
      collect: async () => [],
      apply: async () => ({ applied: 0, ignored: 0 }),
    });
    cyclic.registerCategory({
      descriptor: {
        id: 'learning.memory',
        contractVersion: '1.0.0',
        mergeStrategy: 'append-only',
        privacy: 'private-encrypted',
        dependencies: ['learning.lexicon'],
      },
      collect: async () => [],
      apply: async () => ({ applied: 0, ignored: 0 }),
    });
    expect(() => cyclic.resolve()).toThrow('Sync category dependency cycle');
  });
});
