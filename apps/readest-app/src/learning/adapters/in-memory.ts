import type {
  ActivityAttempt,
  ActivityResult,
  ActivitySpec,
  Artifact,
  LearningEvent,
  Lexeme,
  LexicalGraph,
  Expression,
  Form,
  MemoryReviewEvent,
  Occurrence,
  ReviewItem,
  SavedLearningObject,
  Schedule,
  TodayPlan,
} from '../domain';
import { assertLexicalGraph } from '../domain';
import { learningEventSchema } from '../contracts';
import type {
  ActivityRepositoryPort,
  ArtifactCachePort,
  LearningEventPort,
  LearningPlanPort,
  LexiconRepositoryPort,
  MemoryRepositoryPort,
} from '../ports';

export class InMemoryArtifactCacheAdapter implements ArtifactCachePort {
  readonly #artifacts = new Map<string, Artifact>();

  async getArtifact(key: string): Promise<Artifact | null> {
    return this.#artifacts.get(key) ?? null;
  }

  async putArtifact(key: string, artifact: Artifact): Promise<void> {
    this.#artifacts.set(key, artifact);
  }
}

export class InMemoryActivityAdapter implements ActivityRepositoryPort {
  readonly #specs = new Map<string, ActivitySpec>();
  readonly #attempts = new Map<string, { attempt: ActivityAttempt; result: ActivityResult }>();

  async getSpec(id: string): Promise<ActivitySpec | null> {
    return this.#specs.get(id) ?? null;
  }

  async saveSpec(spec: ActivitySpec): Promise<void> {
    this.#specs.set(spec.id, spec);
  }

  async saveAttempt(attempt: ActivityAttempt, result: ActivityResult): Promise<void> {
    if (!this.#attempts.has(attempt.id)) this.#attempts.set(attempt.id, { attempt, result });
  }
}

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
  readonly #lexemes = new Map<string, Lexeme>();
  readonly #lexemeIdsByKey = new Map<string, string>();
  readonly #forms = new Map<string, Form>();
  readonly #formIdsByKey = new Map<string, string>();
  readonly #expressions = new Map<string, Expression>();
  readonly #expressionIdsByKey = new Map<string, string>();
  readonly #graphs = new Map<string, LexicalGraph>();

  async upsertLearningObject(
    candidate: SavedLearningObject,
    candidateGraph: LexicalGraph,
    occurrence: Occurrence,
  ): Promise<{
    learningObject: SavedLearningObject;
    created: boolean;
    occurrenceCreated: boolean;
  }> {
    assertLexicalGraph(candidate, candidateGraph);
    const key = learningObjectKey(candidate);
    const existingId = this.#objectIdsByKey.get(key);
    let learningObject = existingId ? this.#objects.get(existingId)! : candidate;
    const created = existingId === undefined;
    if (created) {
      let graph: LexicalGraph = { forms: [] };
      if (candidateGraph.lexeme) {
        const lexemeKey = `${candidateGraph.lexeme.language.toLowerCase()}\u0000${candidateGraph.lexeme.normalizedLemma}`;
        const existingLexemeId = this.#lexemeIdsByKey.get(lexemeKey);
        const lexeme = existingLexemeId
          ? this.#lexemes.get(existingLexemeId)!
          : candidateGraph.lexeme;
        if (!existingLexemeId) {
          this.#lexemes.set(lexeme.id, lexeme);
          this.#lexemeIdsByKey.set(lexemeKey, lexeme.id);
        }
        const forms = candidateGraph.forms.map((candidateForm) => {
          const formKey = `${lexeme.id}\u0000${candidateForm.language.toLowerCase()}\u0000${candidateForm.normalizedText}\u0000${candidateForm.formType}`;
          const existingFormId = this.#formIdsByKey.get(formKey);
          if (existingFormId) return this.#forms.get(existingFormId)!;
          const form = { ...candidateForm, lexemeId: lexeme.id };
          this.#forms.set(form.id, form);
          this.#formIdsByKey.set(formKey, form.id);
          return form;
        });
        const sense = candidateGraph.sense
          ? { ...candidateGraph.sense, lexemeId: lexeme.id }
          : undefined;
        learningObject = {
          ...candidate,
          lexemeId: lexeme.id,
          ...(sense ? { senseId: sense.id } : {}),
        };
        graph = { lexeme, forms, ...(sense ? { sense } : {}) };
      } else if (candidateGraph.expression) {
        const expressionKey = `${candidateGraph.expression.expressionType}\u0000${candidateGraph.expression.language.toLowerCase()}\u0000${candidateGraph.expression.normalizedText}`;
        const existingExpressionId = this.#expressionIdsByKey.get(expressionKey);
        const expression = existingExpressionId
          ? this.#expressions.get(existingExpressionId)!
          : candidateGraph.expression;
        if (!existingExpressionId) {
          this.#expressions.set(expression.id, expression);
          this.#expressionIdsByKey.set(expressionKey, expression.id);
        }
        learningObject = { ...candidate, expressionId: expression.id };
        graph = { forms: [], expression };
      } else {
        throw new Error(`Lexical graph is missing an owner for ${candidate.kind}`);
      }
      this.#objects.set(learningObject.id, learningObject);
      this.#objectIdsByKey.set(key, learningObject.id);
      this.#graphs.set(learningObject.id, graph);
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

  async getLexicalGraph(learningObjectId: string): Promise<LexicalGraph | null> {
    return this.#graphs.get(learningObjectId) ?? null;
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
    const validEvent = learningEventSchema.parse(event);
    if (!this.#events.some((candidate) => candidate.id === validEvent.id)) {
      this.#events.push(validEvent);
    }
  }

  async list(): Promise<readonly LearningEvent[]> {
    return this.all();
  }

  all(): readonly LearningEvent[] {
    return [...this.#events];
  }
}
