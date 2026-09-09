import type {
  LearningObjectKind,
  LexicalGraph,
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
import { LEARNING_EVENT_CONTRACT_VERSION } from '../domain';
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
  eventContext?: () => { clientSessionId: string; actorId?: string };
}

const defaultCreateId = (): string => crypto.randomUUID();
const normalizeText = (text: string): string =>
  text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
const dateKey = (date: Date): string => date.toISOString().slice(0, 10);
const dueDeltaBucket = (
  dueAt: Date | undefined,
  occurredAt: Date,
): 'early' | 'on_time' | 'late' | 'unknown' => {
  if (!dueAt) return 'unknown';
  const delta = occurredAt.getTime() - dueAt.getTime();
  if (delta < 0) return 'early';
  return delta <= 24 * 60 * 60 * 1000 ? 'on_time' : 'late';
};
const locatorType = (
  occurrence: Occurrence,
): 'cfi' | 'css_selector' | 'fragment' | 'progression' | 'unknown' => {
  const locations = occurrence.locator.locations;
  if (locations.cfi) return 'cfi';
  if (locations.cssSelector) return 'css_selector';
  if (locations.fragment) return 'fragment';
  if (locations.progression !== undefined || locations.totalProgression !== undefined) {
    return 'progression';
  }
  return 'unknown';
};

export class LearningOrchestrator implements LearningOrchestratorPort {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly eventContext: () => { clientSessionId: string; actorId?: string };

  constructor(private readonly dependencies: LearningOrchestratorDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? defaultCreateId;
    this.eventContext = dependencies.eventContext ?? (() => ({ clientSessionId: 'local-session' }));
  }

  async saveSelection(
    selection: SelectionContext,
    kind: LearningObjectKind,
    saveMode: 'save' | 'save_and_practice' = 'save',
  ): Promise<{ learningObject: SavedLearningObject; created: boolean }> {
    const now = this.now();
    const text = selection.text.trim();
    const normalizedText = normalizeText(selection.text);
    const learningObject: SavedLearningObject = {
      id: this.createId(),
      kind,
      text,
      normalizedText,
      language: selection.language,
      createdAt: now,
      updatedAt: now,
    };
    const graph: LexicalGraph = { forms: [] };
    if (kind === 'word' || kind === 'sense') {
      const lexemeId = this.createId();
      const lexeme = {
        id: lexemeId,
        lemma: text,
        normalizedLemma: normalizedText,
        language: selection.language,
        createdAt: now,
      };
      const form = {
        id: this.createId(),
        lexemeId,
        text,
        normalizedText,
        language: selection.language,
        formType: 'lemma' as const,
        createdAt: now,
      };
      graph.lexeme = lexeme;
      graph.forms = [form];
      learningObject.lexemeId = lexemeId;
      if (kind === 'sense') {
        const sense = {
          id: this.createId(),
          lexemeId,
          status: 'unresolved' as const,
          createdAt: now,
        };
        graph.sense = sense;
        learningObject.senseId = sense.id;
      }
    } else {
      const expression = {
        id: this.createId(),
        text,
        normalizedText,
        language: selection.language,
        expressionType: kind,
        createdAt: now,
      };
      graph.expression = expression;
      learningObject.expressionId = expression.id;
    }
    const occurrence: Occurrence = {
      id: this.createId(),
      learningObjectId: learningObject.id,
      contentId: selection.contentId,
      contentVersionId: selection.contentVersionId,
      locator: selection.locator,
      contextText: selection.text,
      createdAt: now,
    };
    const result = await this.dependencies.lexicon.upsertLearningObject(
      learningObject,
      graph,
      occurrence,
    );
    if (result.created) {
      const context = this.eventContext();
      await this.dependencies.events.publish({
        id: this.createId(),
        contractVersion: LEARNING_EVENT_CONTRACT_VERSION,
        type: 'learning_object_saved',
        occurredAt: now,
        clientSessionId: context.clientSessionId,
        ...(context.actorId ? { actorId: context.actorId } : {}),
        aggregateId: result.learningObject.id,
        properties: {
          objectType: kind,
          saveMode,
          contentId: selection.contentId,
          memorySubjectId: result.learningObject.id,
        },
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
    const context = this.eventContext();
    await this.dependencies.events.publish({
      id: `memory-review:${appended.event.id}`,
      contractVersion: LEARNING_EVENT_CONTRACT_VERSION,
      type: 'memory_review_completed',
      occurredAt: appended.event.occurredAt,
      clientSessionId: context.clientSessionId,
      ...(context.actorId ? { actorId: context.actorId } : {}),
      aggregateId: reviewItemId,
      properties: {
        memorySubjectId: item.learningObjectId,
        ratingClass: rating,
        dueDeltaBucket: dueDeltaBucket(previousSchedule?.dueAt, appended.event.occurredAt),
        reviewEventId: appended.event.id,
      },
    });
    return { event: appended.event, schedule };
  }

  async recordSourceReturn(occurrence: Occurrence, memorySubjectId: string): Promise<void> {
    const context = this.eventContext();
    await this.dependencies.events.publish({
      id: this.createId(),
      contractVersion: LEARNING_EVENT_CONTRACT_VERSION,
      type: 'source_context_returned',
      occurredAt: this.now(),
      clientSessionId: context.clientSessionId,
      ...(context.actorId ? { actorId: context.actorId } : {}),
      aggregateId: memorySubjectId,
      properties: {
        contentId: occurrence.contentId,
        locatorType: locatorType(occurrence),
        memorySubjectId,
      },
    });
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
