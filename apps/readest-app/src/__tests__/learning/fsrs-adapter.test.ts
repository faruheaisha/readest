import { describe, expect, it } from 'vitest';
import { FsrsMemorySchedulerAdapter } from '@/learning/adapters/fsrs';
import type { MemoryReviewEvent, ReviewItem, Schedule } from '@/learning/domain';

const item: ReviewItem = {
  id: 'review-1',
  learningObjectId: 'learning-1',
  policyId: 'memory.fsrs.default',
  createdAt: new Date('2026-09-07T12:00:00.000Z'),
};

const event = (rating: MemoryReviewEvent['rating'], occurredAt: string): MemoryReviewEvent => ({
  id: `event-${rating}-${occurredAt}`,
  reviewItemId: item.id,
  attemptKey: `attempt-${rating}-${occurredAt}`,
  rating,
  occurredAt: new Date(occurredAt),
});

describe('FsrsMemorySchedulerAdapter', () => {
  it('maps the domain rating to ts-fsrs and returns a domain schedule', () => {
    const adapter = new FsrsMemorySchedulerAdapter({ enableFuzzing: false });

    const schedule = adapter.schedule(item, event('good', '2026-09-07T12:00:00.000Z'));

    expect(schedule.reviewItemId).toBe(item.id);
    expect(schedule.state).not.toBe('new');
    expect(schedule.dueAt.getTime()).toBeGreaterThan(
      event('good', '2026-09-07T12:00:00.000Z').occurredAt.getTime(),
    );
    expect(schedule.reps).toBe(1);
  });

  it('continues from the previous FSRS state instead of resetting the card', () => {
    const adapter = new FsrsMemorySchedulerAdapter({ enableFuzzing: false });
    const first = adapter.schedule(item, event('good', '2026-09-07T12:00:00.000Z'));
    const second = adapter.schedule(
      item,
      event('good', first.dueAt.toISOString()),
      first as Schedule,
    );

    expect(second.reps).toBe(2);
    expect(second.stability).toBeGreaterThanOrEqual(first.stability);
    expect(second.lastReviewAt?.toISOString()).toBe(first.dueAt.toISOString());
  });
});
