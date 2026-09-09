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
      'learning_expressions',
      'learning_forms',
      'learning_identity_links',
      'learning_identity_state',
      'learning_lexemes',
      'learning_objects',
      'learning_occurrences',
      'learning_review_events',
      'learning_review_items',
      'learning_schedules',
      'learning_senses',
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
      'memory_review_completed',
    ]);
  });

  it('persists canonical lexical nodes without merging distinct review targets', async () => {
    let id = 0;
    const orchestrator = new LearningOrchestrator({
      lexicon: adapter,
      memory: adapter,
      scheduler: new FsrsMemorySchedulerAdapter({ enableFuzzing: false }),
      plans: adapter,
      events: adapter,
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      createId: () => `lexical-${++id}`,
    });
    const selection = {
      contentId: 'book-lexical',
      contentVersionId: 'book-lexical-v1',
      text: 'Evidence',
      language: 'en',
      locator: {
        href: 'chapter.xhtml',
        locations: { progression: 0.4 },
        text: { highlight: 'Evidence' },
      },
    } as const;

    const word = await orchestrator.saveSelection(selection, 'word');
    const sense = await orchestrator.saveSelection(selection, 'sense');
    const wordGraph = await adapter.getLexicalGraph(word.learningObject.id);
    const senseGraph = await adapter.getLexicalGraph(sense.learningObject.id);

    expect(word.learningObject.id).not.toBe(sense.learningObject.id);
    expect(wordGraph?.lexeme?.id).toBe(senseGraph?.lexeme?.id);
    expect(wordGraph?.forms).toHaveLength(1);
    expect(senseGraph?.forms).toEqual(wordGraph?.forms);
    expect(senseGraph?.sense).toEqual(
      expect.objectContaining({ status: 'unresolved', lexemeId: wordGraph?.lexeme?.id }),
    );
    expect(senseGraph?.sense?.definition).toBeUndefined();
  });

  it('rolls back lexical nodes when a learning-object write fails', async () => {
    const createdAt = new Date('2026-09-07T12:00:00.000Z');
    const orchestrator = new LearningOrchestrator({
      lexicon: adapter,
      memory: adapter,
      scheduler: new FsrsMemorySchedulerAdapter({ enableFuzzing: false }),
      plans: adapter,
      events: adapter,
      now: () => createdAt,
      createId: (() => {
        let id = 0;
        return () => `collision-${++id}`;
      })(),
    });
    const selection = {
      contentId: 'book-collision',
      contentVersionId: 'book-collision-v1',
      text: 'existing expression',
      language: 'en',
      locator: { href: 'chapter.xhtml', locations: { progression: 0.1 } },
    } as const;
    const existing = await orchestrator.saveSelection(selection, 'expression');
    const candidate = {
      id: existing.learningObject.id,
      kind: 'word',
      text: 'atomic',
      normalizedText: 'atomic',
      language: 'en',
      createdAt,
      updatedAt: createdAt,
    } as const;
    const graph = {
      lexeme: {
        id: 'rollback-lexeme',
        lemma: 'atomic',
        normalizedLemma: 'atomic',
        language: 'en',
        createdAt,
      },
      forms: [
        {
          id: 'rollback-form',
          lexemeId: 'rollback-lexeme',
          text: 'atomic',
          normalizedText: 'atomic',
          language: 'en',
          formType: 'lemma',
          createdAt,
        },
      ],
    } as const;
    const occurrence = {
      id: 'rollback-occurrence',
      learningObjectId: candidate.id,
      contentId: selection.contentId,
      contentVersionId: selection.contentVersionId,
      locator: selection.locator,
      contextText: candidate.text,
      createdAt,
    } as const;

    await expect(adapter.upsertLearningObject(candidate, graph, occurrence)).rejects.toThrow();

    expect(await db.select('SELECT id FROM learning_lexemes')).toEqual([]);
    expect(await db.select('SELECT id FROM learning_forms')).toEqual([]);
    expect(await db.select('SELECT id FROM learning_objects')).toHaveLength(1);
  });

  it('upgrades legacy learning facts into the versioned evidence contract', async () => {
    const legacyDb = await NodeDatabaseService.open(':memory:');
    const migrations = getMigrations('learning');
    const eventMigrationIndex = migrations.findIndex(
      (migration) => migration.name === '2026090901_learning_event_contract_v1',
    );
    const legacyMigrations = migrations.slice(0, eventMigrationIndex);

    try {
      await migrate(legacyDb, legacyMigrations);
      await legacyDb.execute(
        `INSERT INTO learning_events
          (id, type, occurred_at, actor_id, aggregate_id, properties_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'legacy-save-1',
          'learning_object_saved',
          new Date('2026-09-01T12:00:00.000Z').getTime(),
          'guest-legacy',
          'object-1',
          JSON.stringify({ kind: 'word', contentId: 'book-1' }),
        ],
      );
      await legacyDb.execute(
        `INSERT INTO learning_events
          (id, type, occurred_at, actor_id, aggregate_id, properties_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'legacy-review-1',
          'review_completed',
          new Date('2026-09-02T12:00:00.000Z').getTime(),
          'guest-legacy',
          'review-item-1',
          JSON.stringify({ rating: 'good', learningObjectId: 'object-1' }),
        ],
      );

      await migrate(legacyDb, migrations);
      const migrated = await new ReadestLearningDatabaseAdapter(legacyDb).list();

      expect(migrated).toEqual([
        expect.objectContaining({
          id: 'legacy-save-1',
          type: 'learning_object_saved',
          contractVersion: '1.0.0',
          clientSessionId: 'legacy-session',
          properties: {
            objectType: 'word',
            saveMode: 'save',
            contentId: 'book-1',
            memorySubjectId: 'object-1',
          },
        }),
        expect.objectContaining({
          id: 'legacy-review-1',
          type: 'memory_review_completed',
          contractVersion: '1.0.0',
          clientSessionId: 'legacy-session',
          properties: {
            memorySubjectId: 'object-1',
            ratingClass: 'good',
            dueDeltaBucket: 'unknown',
            reviewEventId: 'legacy-review-1',
          },
        }),
      ]);
    } finally {
      await legacyDb.close();
    }
  });

  it('backfills the lexical graph without changing legacy learning or review IDs', async () => {
    const legacyDb = await NodeDatabaseService.open(':memory:');
    const migrations = getMigrations('learning');
    const lexicalMigrationIndex = migrations.findIndex(
      (migration) => migration.name === '2026090902_learning_lexical_graph',
    );

    try {
      await migrate(legacyDb, migrations.slice(0, lexicalMigrationIndex));
      const createdAt = new Date('2026-09-01T12:00:00.000Z').getTime();
      for (const [id, kind, text, normalized] of [
        ['legacy-word', 'word', 'Evidence', 'evidence'],
        ['legacy-sense', 'sense', 'evidence', 'evidence'],
        ['legacy-expression', 'expression', 'break the ice', 'break the ice'],
        ['legacy-sentence', 'sentence', 'break the ice', 'break the ice'],
      ] as const) {
        await legacyDb.execute(
          `INSERT INTO learning_objects
            (id, kind, text, normalized_text, language, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'en', ?, ?)`,
          [id, kind, text, normalized, createdAt, createdAt],
        );
      }
      await legacyDb.execute(
        `INSERT INTO learning_review_items (id, learning_object_id, policy_id, created_at)
         VALUES ('legacy-review', 'legacy-word', 'memory.fsrs.default', ?)`,
        [createdAt],
      );

      await migrate(legacyDb, migrations);
      const migrated = new ReadestLearningDatabaseAdapter(legacyDb);
      const word = await migrated.getLearningObject('legacy-word');
      const sense = await migrated.getLearningObject('legacy-sense');
      const wordGraph = await migrated.getLexicalGraph('legacy-word');
      const senseGraph = await migrated.getLexicalGraph('legacy-sense');
      const expressionGraph = await migrated.getLexicalGraph('legacy-expression');
      const sentenceGraph = await migrated.getLexicalGraph('legacy-sentence');

      expect(word?.id).toBe('legacy-word');
      expect(sense?.id).toBe('legacy-sense');
      expect(wordGraph?.lexeme?.id).toBe(senseGraph?.lexeme?.id);
      expect(wordGraph?.forms).toHaveLength(1);
      expect(senseGraph?.sense).toEqual(
        expect.objectContaining({ status: 'unresolved', lexemeId: wordGraph?.lexeme?.id }),
      );
      expect(expressionGraph?.expression?.expressionType).toBe('expression');
      expect(sentenceGraph?.expression?.expressionType).toBe('sentence');
      expect((await migrated.getReviewItem('legacy-review'))?.learningObjectId).toBe('legacy-word');
    } finally {
      await legacyDb.close();
    }
  });
});
