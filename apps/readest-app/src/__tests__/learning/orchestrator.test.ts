import { describe, expect, it } from 'vitest';
import {
  InMemoryLearningEventAdapter,
  InMemoryLearningPlanAdapter,
  InMemoryLexiconAdapter,
  InMemoryMemoryAdapter,
} from '@/learning/adapters/in-memory';
import { LearningOrchestrator } from '@/learning/application';
import type { MemorySchedulerPort } from '@/learning/ports';

const scheduler: MemorySchedulerPort = {
  schedule(reviewItem, event) {
    return {
      reviewItemId: reviewItem.id,
      dueAt: new Date(event.occurredAt.getTime() + 86_400_000),
      stability: 1,
      difficulty: 5,
      scheduledDays: 1,
      state: 'learning',
    };
  },
};

const selection = {
  contentId: 'book-1',
  contentVersionId: 'book-1-v1',
  text: 'context matters',
  language: 'en',
  locator: {
    href: 'chapter-1.xhtml',
    type: 'application/xhtml+xml',
    locations: { progression: 0.2 },
    text: { highlight: 'context matters' },
  },
} as const;

describe('LearningOrchestrator', () => {
  it('deduplicates a saved learning object without losing its source occurrence', async () => {
    const lexicon = new InMemoryLexiconAdapter();
    const events = new InMemoryLearningEventAdapter();
    const orchestrator = new LearningOrchestrator({
      lexicon,
      memory: new InMemoryMemoryAdapter(),
      scheduler,
      plans: new InMemoryLearningPlanAdapter(),
      events,
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      createId: () => 'stable-id',
    });

    const first = await orchestrator.saveSelection(selection, 'expression');
    const second = await orchestrator.saveSelection(selection, 'expression');

    expect(second.learningObject.id).toBe(first.learningObject.id);
    expect(await lexicon.listOccurrences(first.learningObject.id)).toHaveLength(1);
    expect(events.all().filter((event) => event.type === 'learning_object_saved')).toHaveLength(1);
  });

  it('records an immutable review event before deriving the next schedule', async () => {
    const memory = new InMemoryMemoryAdapter();
    const events = new InMemoryLearningEventAdapter();
    const orchestrator = new LearningOrchestrator({
      lexicon: new InMemoryLexiconAdapter(),
      memory,
      scheduler,
      plans: new InMemoryLearningPlanAdapter(),
      events,
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      createId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });
    const saved = await orchestrator.saveSelection(selection, 'sentence');
    const reviewItem = await orchestrator.ensureReviewItem(saved.learningObject.id);

    const result = await orchestrator.submitReview(reviewItem.id, 'good', 'attempt-1');
    const duplicate = await orchestrator.submitReview(reviewItem.id, 'good', 'attempt-1');

    expect(duplicate.event.id).toBe(result.event.id);
    expect(await memory.listReviewEvents(reviewItem.id)).toHaveLength(1);
    expect((await memory.getSchedule(reviewItem.id))?.dueAt.toISOString()).toBe(
      '2026-09-08T12:00:00.000Z',
    );
    expect(events.all().filter((event) => event.type === 'memory_review_completed')).toHaveLength(
      1,
    );
  });

  it('returns one canonical review item under concurrent creation', async () => {
    const memory = new InMemoryMemoryAdapter();
    const orchestrator = new LearningOrchestrator({
      lexicon: new InMemoryLexiconAdapter(),
      memory,
      scheduler,
      plans: new InMemoryLearningPlanAdapter(),
      events: new InMemoryLearningEventAdapter(),
      createId: (() => {
        let id = 0;
        return () => `concurrent-${++id}`;
      })(),
    });
    const saved = await orchestrator.saveSelection(selection, 'word');

    const [left, right] = await Promise.all([
      orchestrator.ensureReviewItem(saved.learningObject.id),
      orchestrator.ensureReviewItem(saved.learningObject.id),
    ]);

    expect(right.id).toBe(left.id);
    expect(await memory.getSchedule(left.id)).not.toBeNull();
  });

  it('builds Today from due reviews and recent saves as projections', async () => {
    const plans = new InMemoryLearningPlanAdapter();
    const orchestrator = new LearningOrchestrator({
      lexicon: new InMemoryLexiconAdapter(),
      memory: new InMemoryMemoryAdapter(),
      scheduler,
      plans,
      events: new InMemoryLearningEventAdapter(),
      now: () => new Date('2026-09-07T12:00:00.000Z'),
      createId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    const saved = await orchestrator.saveSelection(selection, 'expression');
    await orchestrator.ensureReviewItem(saved.learningObject.id);
    const plan = await orchestrator.getTodayPlan();

    expect(plan.items.map((item) => item.kind)).toEqual(['review', 'recent-save']);
    expect((await plans.get(plan.id))?.id).toBe(plan.id);
  });
});
