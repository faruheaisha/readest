import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { MemoryReviewEvent, MemoryState, ReviewItem, ReviewRating, Schedule } from '../domain';
import type { MemorySchedulerPort } from '../ports';

export interface FsrsMemorySchedulerOptions {
  desiredRetention?: number;
  maximumIntervalDays?: number;
  enableFuzzing?: boolean;
}

const ratings: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const domainStates: Record<State, MemoryState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const fsrsStates: Record<MemoryState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const toCard = (schedule: Schedule | undefined, now: Date): Card => {
  if (!schedule || schedule.state === 'new') return createEmptyCard(schedule?.dueAt ?? now);
  return {
    due: schedule.dueAt,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsedDays ?? 0,
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningSteps ?? 0,
    reps: schedule.reps ?? 0,
    lapses: schedule.lapses ?? 0,
    state: fsrsStates[schedule.state],
    last_review: schedule.lastReviewAt,
  };
};

export class FsrsMemorySchedulerAdapter implements MemorySchedulerPort {
  readonly #scheduler: ReturnType<typeof fsrs>;

  constructor(options: FsrsMemorySchedulerOptions = {}) {
    this.#scheduler = fsrs({
      request_retention: options.desiredRetention ?? 0.9,
      maximum_interval: options.maximumIntervalDays ?? 36_500,
      enable_fuzz: options.enableFuzzing ?? true,
    });
  }

  schedule(reviewItem: ReviewItem, event: MemoryReviewEvent, currentSchedule?: Schedule): Schedule {
    const result = this.#scheduler.next(
      toCard(currentSchedule, event.occurredAt),
      event.occurredAt,
      ratings[event.rating],
    );
    return {
      reviewItemId: reviewItem.id,
      dueAt: result.card.due,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      scheduledDays: result.card.scheduled_days,
      state: domainStates[result.card.state],
      elapsedDays: result.card.elapsed_days,
      learningSteps: result.card.learning_steps,
      reps: result.card.reps,
      lapses: result.card.lapses,
      lastReviewAt: result.card.last_review,
    };
  }
}
