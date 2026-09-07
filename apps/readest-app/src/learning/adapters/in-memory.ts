import type {
  LearningEvent,
  MemoryReviewEvent,
  Occurrence,
  ReviewItem,
  SavedLearningObject,
  Schedule,
  TodayPlan,
} from '../domain';
import type {
  LearningEventPort,
  LearningPlanPort,
  LexiconRepositoryPort,
  MemoryRepositoryPort,
} from '../ports';

const locatorKey = (occurrence: Occurrence): string =>
  JSON.stringify({
    contentId: occurrence.contentId,
    contentVersionId: occurrence.contentVersionId,
    href: occurrence.locator.href,
    locations: occurrence.locator.locations,
    highlight: occurrence.locator.text?.highlight,
  });

const learningObjectKey = (value: SavedLearningObject): string =>
  `${value.kind}\u0000${value.language.toLowerCase()}\u0000${value.normalizedText}`;

export class InMemoryLexiconAdapter implements LexiconRepositoryPort {
  readonly #objects = new Map<string, SavedLearningObject>();
  readonly #objectIdsByKey = new Map<string, string>();
  readonly #occurrences = new Map<string, Map<string, Occurrence>>();

  async upsertLearningObject(
    candidate: SavedLearningObject,
    occurrence: Occurrence,
  ): Promise<{
    learningObject: SavedLearningObject;
    created: boolean;
    occurrenceCreated: boolean;
  }> {
    const key = learningObjectKey(candidate);
    const existingId = this.#objectIdsByKey.get(key);
    const learningObject = existingId ? this.#objects.get(existingId)! : candidate;
    const created = existingId === undefined;
    if (created) {
      this.#objects.set(candidate.id, candidate);
      this.#objectIdsByKey.set(key, candidate.id);
    }

    const occurrences = this.#occurrences.get(learningObject.id) ?? new Map<string, Occurrence>();
    const keyForOccurrence = locatorKey(occurrence);
    const occurrenceCreated = !occurrences.has(keyForOccurrence);
    if (occurrenceCreated) {
      occurrences.set(keyForOccurrence, { ...occurrence, learningObjectId: learningObject.id });
      this.#occurrences.set(learningObject.id, occurrences);
    }
    return { learningObject, created, occurrenceCreated };
  }

  async getLearningObject(id: string): Promise<SavedLearningObject | null> {
    return this.#objects.get(id) ?? null;
  }

  async listRecent(limit: number): Promise<readonly SavedLearningObject[]> {
    return [...this.#objects.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  async listOccurrences(learningObjectId: string): Promise<readonly Occurrence[]> {
    return [...(this.#occurrences.get(learningObjectId)?.values() ?? [])];
  }
}

export class InMemoryMemoryAdapter implements MemoryRepositoryPort {
  readonly #items = new Map<string, ReviewItem>();
  readonly #itemIdsByLearningObject = new Map<string, string>();
  readonly #events = new Map<string, MemoryReviewEvent>();
  readonly #eventIdsByAttemptKey = new Map<string, string>();
  readonly #schedules = new Map<string, Schedule>();

  async getReviewItem(id: string): Promise<ReviewItem | null> {
    return this.#items.get(id) ?? null;
  }

  async findReviewItemByLearningObject(learningObjectId: string): Promise<ReviewItem | null> {
    const id = this.#itemIdsByLearningObject.get(learningObjectId);
    return id ? (this.#items.get(id) ?? null) : null;
  }

  async saveReviewItem(item: ReviewItem): Promise<ReviewItem> {
    const existing = this.#itemIdsByLearningObject.get(item.learningObjectId);
    if (existing) return this.#items.get(existing)!;
    this.#items.set(item.id, item);
    this.#itemIdsByLearningObject.set(item.learningObjectId, item.id);
    return item;
  }

  async appendReviewEvent(
    event: MemoryReviewEvent,
  ): Promise<{ event: MemoryReviewEvent; created: boolean }> {
    const existingId = this.#eventIdsByAttemptKey.get(event.attemptKey);
    if (existingId) return { event: this.#events.get(existingId)!, created: false };
    this.#events.set(event.id, event);
    this.#eventIdsByAttemptKey.set(event.attemptKey, event.id);
    return { event, created: true };
  }

  async listReviewEvents(reviewItemId: string): Promise<readonly MemoryReviewEvent[]> {
    return [...this.#events.values()]
      .filter((event) => event.reviewItemId === reviewItemId)
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  }

  async saveSchedule(schedule: Schedule): Promise<void> {
    this.#schedules.set(schedule.reviewItemId, schedule);
  }

  async getSchedule(reviewItemId: string): Promise<Schedule | null> {
    return this.#schedules.get(reviewItemId) ?? null;
  }

  async listDue(at: Date): Promise<readonly { reviewItem: ReviewItem; schedule: Schedule }[]> {
    return [...this.#schedules.values()]
      .filter((schedule) => schedule.dueAt.getTime() <= at.getTime())
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())
      .map((schedule) => ({ reviewItem: this.#items.get(schedule.reviewItemId)!, schedule }));
  }
}

export class InMemoryLearningPlanAdapter implements LearningPlanPort {
  readonly #plans = new Map<string, TodayPlan>();
  readonly #idsByDate = new Map<string, string>();

  async save(plan: TodayPlan): Promise<void> {
    this.#plans.set(plan.id, plan);
    this.#idsByDate.set(plan.date, plan.id);
  }

  async get(id: string): Promise<TodayPlan | null> {
    return this.#plans.get(id) ?? null;
  }

  async getByDate(date: string): Promise<TodayPlan | null> {
    const id = this.#idsByDate.get(date);
    return id ? (this.#plans.get(id) ?? null) : null;
  }
}

export class InMemoryLearningEventAdapter implements LearningEventPort {
  readonly #events: LearningEvent[] = [];

  async publish(event: LearningEvent): Promise<void> {
    if (!this.#events.some((candidate) => candidate.id === event.id)) this.#events.push(event);
  }

  async list(): Promise<readonly LearningEvent[]> {
    return this.all();
  }

  all(): readonly LearningEvent[] {
    return [...this.#events];
  }
}
