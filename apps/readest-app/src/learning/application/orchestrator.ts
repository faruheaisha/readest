import type {
  LearningObjectKind,
  MemoryReviewEvent,
  Occurrence,
  ReviewItem,
  ReviewRating,
  SavedLearningObject,
  Schedule,
  SelectionContext,
  TodayPlan,
  TodayPlanItem,
} from '../domain';
import type {
  LearningEventPort,
  LearningOrchestratorPort,
  LearningPlanPort,
  LexiconRepositoryPort,
  MemoryRepositoryPort,
  MemorySchedulerPort,
} from '../ports';

export interface LearningOrchestratorDependencies {
  lexicon: LexiconRepositoryPort;
  memory: MemoryRepositoryPort;
  scheduler: MemorySchedulerPort;
  plans: LearningPlanPort;
  events: LearningEventPort;
  now?: () => Date;
  createId?: () => string;
}

const defaultCreateId = (): string => crypto.randomUUID();
const normalizeText = (text: string): string =>
  text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

export class LearningOrchestrator implements LearningOrchestratorPort {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly dependencies: LearningOrchestratorDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? defaultCreateId;
  }

  async saveSelection(
    selection: SelectionContext,
    kind: LearningObjectKind,
  ): Promise<{ learningObject: SavedLearningObject; created: boolean }> {
    const now = this.now();
    const learningObject: SavedLearningObject = {
      id: this.createId(),
      kind,
      text: selection.text.trim(),
      normalizedText: normalizeText(selection.text),
      language: selection.language,
      createdAt: now,
      updatedAt: now,
    };
    const occurrence: Occurrence = {
      id: this.createId(),
      learningObjectId: learningObject.id,
      contentId: selection.contentId,
      contentVersionId: selection.contentVersionId,
      locator: selection.locator,
      contextText: selection.text,
      createdAt: now,
    };
    const result = await this.dependencies.lexicon.upsertLearningObject(learningObject, occurrence);
    if (result.created) {
      await this.dependencies.events.publish({
        id: this.createId(),
        type: 'learning_object_saved',
        occurredAt: now,
        aggregateId: result.learningObject.id,
        properties: { kind, contentId: selection.contentId },
      });
    }
    return { learningObject: result.learningObject, created: result.created };
  }

  async ensureReviewItem(learningObjectId: string): Promise<ReviewItem> {
    const existing =
      await this.dependencies.memory.findReviewItemByLearningObject(learningObjectId);
    if (existing) return existing;
    const now = this.now();
    const item: ReviewItem = {
      id: this.createId(),
      learningObjectId,
      policyId: 'memory.fsrs.default',
      createdAt: now,
    };
    const canonicalItem = await this.dependencies.memory.saveReviewItem(item);
    await this.dependencies.memory.saveSchedule({
      reviewItemId: canonicalItem.id,
      dueAt: now,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      state: 'new',
    });
    return canonicalItem;
  }

  async submitReview(
    reviewItemId: string,
    rating: ReviewRating,
    attemptKey: string,
  ): Promise<{ event: MemoryReviewEvent; schedule: Schedule }> {
    const item = await this.dependencies.memory.getReviewItem(reviewItemId);
    if (!item) throw new Error(`Review item "${reviewItemId}" was not found`);
    const candidate: MemoryReviewEvent = {
      id: this.createId(),
      reviewItemId,
      attemptKey,
      rating,
      occurredAt: this.now(),
    };
    const previousSchedule = await this.dependencies.memory.getSchedule(reviewItemId);
    const appended = await this.dependencies.memory.appendReviewEvent(candidate);
    if (!appended.created) {
      const current = await this.dependencies.memory.getSchedule(reviewItemId);
      if (!current) throw new Error(`Schedule for review item "${reviewItemId}" was not found`);
      return { event: appended.event, schedule: current };
    }
    const schedule = await this.dependencies.scheduler.schedule(
      item,
      appended.event,
      previousSchedule ?? undefined,
    );
    await this.dependencies.memory.saveSchedule(schedule);
    await this.dependencies.events.publish({
      id: this.createId(),
      type: 'review_completed',
      occurredAt: appended.event.occurredAt,
      aggregateId: reviewItemId,
      properties: { rating, learningObjectId: item.learningObjectId },
    });
    return { event: appended.event, schedule };
  }

  async getTodayPlan(): Promise<TodayPlan> {
    const now = this.now();
    const date = dateKey(now);
    const due = await this.dependencies.memory.listDue(now);
    const recent = await this.dependencies.lexicon.listRecent(5);
    const reviewItems: TodayPlanItem[] = due.map(({ reviewItem, schedule }) => ({
      id: `review:${reviewItem.id}`,
      kind: 'review',
      reviewItemId: reviewItem.id,
      dueAt: schedule.dueAt,
    }));
    const recentItems: TodayPlanItem[] = recent.map((learningObject) => ({
      id: `recent:${learningObject.id}`,
      kind: 'recent-save',
      learningObjectId: learningObject.id,
      createdAt: learningObject.createdAt,
    }));
    const plan: TodayPlan = {
      id: this.createId(),
      date,
      generatedAt: now,
      items: [...reviewItems, ...recentItems],
    };
    await this.dependencies.plans.save(plan);
    return plan;
  }
}
