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
      'learning_activity_attempts',
      'learning_activity_results',
      'learning_activity_specs',
      'learning_annotations',
      'learning_artifacts',
      'learning_events',
      'learning_identity_links',
      'learning_identity_state',
      'learning_objects',
      'learning_occurrences',
      'learning_review_events',
      'learning_review_items',
      'learning_schedules',
      'learning_today_plans',
    ]);
  });

  it('links one stable guest identity to an account without rewriting learning IDs', async () => {
    const guestId = await adapter.getOrCreateGuestId('guest-fixed');

    expect(await adapter.getOrCreateGuestId('guest-other')).toBe(guestId);
    await adapter.linkGuestIdentity(guestId, 'subject-1', new Date('2026-09-08T12:00:00.000Z'));
    await adapter.linkGuestIdentity(guestId, 'subject-1', new Date('2026-09-08T12:01:00.000Z'));

    expect(await adapter.getLinkedSubject(guestId)).toBe('subject-1');
    await expect(
      adapter.linkGuestIdentity(guestId, 'subject-2', new Date('2026-09-08T12:02:00.000Z')),
    ).rejects.toThrow('already linked');
  });

  it('persists generated Artifacts under their complete cache identity', async () => {
    const artifact = {
      id: 'artifact-1',
      actionId: 'ai.explain',
      selection: {
        contentId: 'book-1',
        contentVersionId: 'book-1-v1',
        text: 'break the ice',
        language: 'en',
        locator: {
          href: 'chapter.xhtml',
          locations: { progression: 0.3 },
          text: { highlight: 'break the ice' },
        },
      },
      kind: 'explanation',
      content: 'Start a friendly conversation.',
      language: 'en',
      provider: { id: 'readest.openrouter', version: '1.0.0', model: 'test-model' },
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
    } as const;

    await adapter.putArtifact('complete-cache-key', artifact);

    expect(await adapter.getArtifact('complete-cache-key')).toEqual(artifact);
  });

  it('persists activity specs, attempts, and results through the Activity repository port', async () => {
    const spec = {
      id: 'spec-1',
      kind: 'typing',
      learningObjectId: 'object-1',
      prompt: 'Type it',
      answer: 'evidence',
    } as const;
    const attempt = {
      id: 'attempt-1',
      activityId: spec.id,
      learningObjectId: spec.learningObjectId,
      response: 'evidence',
      startedAt: new Date('2026-09-07T12:00:00.000Z'),
      completedAt: new Date('2026-09-07T12:00:02.000Z'),
    };
    const result = {
      attemptId: attempt.id,
      correct: true,
      score: 1,
      durationMs: 2_000,
      completedAt: attempt.completedAt,
    };

    await adapter.saveSpec(spec);
    await adapter.saveAttempt(attempt, result);

    expect(await adapter.getSpec(spec.id)).toEqual(spec);
    const rows = await db.select<{ score: number }>(
      'SELECT score FROM learning_activity_results WHERE attempt_id = ?',
      [attempt.id],
    );
    expect(rows[0]?.score).toBe(1);
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
