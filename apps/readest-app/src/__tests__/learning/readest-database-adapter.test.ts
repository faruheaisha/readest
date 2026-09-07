import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReadestLearningDatabaseAdapter } from '@/learning/adapters/readest-database';
import { LearningOrchestrator } from '@/learning/application';
import { FsrsMemorySchedulerAdapter } from '@/learning/adapters/fsrs';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { getMigrations } from '@/services/database/migrations';
import { migrate } from '@/services/database/migrate';
import type { DatabaseService } from '@/types/database';

describe('ReadestLearningDatabaseAdapter', () => {
  let db: DatabaseService;
  let adapter: ReadestLearningDatabaseAdapter;

  beforeEach(async () => {
    db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('learning'));
    adapter = new ReadestLearningDatabaseAdapter(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('registers the local-first learning schema', async () => {
    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'learning_%' ORDER BY name",
    );

    expect(tables.map((row) => row.name)).toEqual([
      'learning_annotations',
      'learning_events',
      'learning_objects',
      'learning_occurrences',
      'learning_review_events',
      'learning_review_items',
      'learning_schedules',
      'learning_today_plans',
    ]);
  });

  it('persists the complete save, review, and Today projection loop', async () => {
    let id = 0;
    const orchestrator = new LearningOrchestrator({
      lexicon: adapter,
      memory: adapter,
      scheduler: new FsrsMemorySchedulerAdapter({ enableFuzzing: false }),
      plans: adapter,
      events: adapter,
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      createId: () => `db-id-${++id}`,
    });
    const selection = {
      contentId: 'book-1',
      contentVersionId: 'book-1-v1',
      text: 'Evidence based learning',
      language: 'en',
      locator: {
        href: 'chapter-1.xhtml',
        locations: { progression: 0.25 },
        text: { highlight: 'Evidence based learning' },
      },
    } as const;

    const saved = await orchestrator.saveSelection(selection, 'expression');
    const duplicate = await orchestrator.saveSelection(selection, 'expression');
    const review = await orchestrator.ensureReviewItem(saved.learningObject.id);
    await orchestrator.submitReview(review.id, 'good', 'attempt-1');
    const today = await orchestrator.getTodayPlan();

    expect(duplicate.created).toBe(false);
    expect(await adapter.listOccurrences(saved.learningObject.id)).toHaveLength(1);
    expect(await adapter.listReviewEvents(review.id)).toHaveLength(1);
    expect((await adapter.getSchedule(review.id))?.state).toBe('learning');
    expect((await adapter.get(today.id))?.items).toHaveLength(1);
    expect((await adapter.list()).map((event) => event.type)).toEqual([
      'learning_object_saved',
      'review_completed',
    ]);
  });
});
