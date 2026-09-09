import type { DatabaseService } from '@/types/database';
import { learningEventSchema, locatorSchema, selectionContextSchema } from '../contracts';
import { assertLexicalGraph } from '../domain';
import type {
  ActivityAttempt,
  ActivityResult,
  ActivitySpec,
  Artifact,
  Expression,
  Form,
  LearningEvent,
  LearningEventType,
  Lexeme,
  LexicalGraph,
  MemoryReviewEvent,
  MemoryState,
  Occurrence,
  ReviewItem,
  ReviewRating,
  SavedLearningObject,
  Schedule,
  Sense,
  TodayPlan,
  TodayPlanItem,
} from '../domain';
import type {
  ActivityRepositoryPort,
  ArtifactCachePort,
  LearningEventPort,
  LearningIdentityRepositoryPort,
  LearningPlanPort,
  LexiconRepositoryPort,
  MemoryRepositoryPort,
} from '../ports';

interface ActivitySpecRow {
  id: string;
  kind: ActivitySpec['kind'];
  learning_object_id: string;
  prompt: string;
  answer: string;
  source_locator_json: string | null;
  [key: string]: unknown;
}

interface ArtifactRow {
  cache_key: string;
  id: string;
  action_id: string;
  selection_json: string;
  kind: Artifact['kind'];
  content: string;
  language: string;
  provider_json: string;
  created_at: number;
  [key: string]: unknown;
}

interface LearningObjectRow {
  id: string;
  kind: SavedLearningObject['kind'];
  text: string;
  normalized_text: string;
  language: string;
  lexeme_id: string | null;
  sense_id: string | null;
  expression_id: string | null;
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

interface LexemeRow {
  id: string;
  lemma: string;
  normalized_lemma: string;
  language: string;
  part_of_speech: string | null;
  created_at: number;
  [key: string]: unknown;
}

interface FormRow {
  id: string;
  lexeme_id: string;
  text: string;
  normalized_text: string;
  language: string;
  form_type: Form['formType'];
  created_at: number;
  [key: string]: unknown;
}

interface SenseRow {
  id: string;
  lexeme_id: string;
  definition: string | null;
  definition_language: string | null;
  part_of_speech: string | null;
  status: Sense['status'];
  created_at: number;
  [key: string]: unknown;
}

interface ExpressionRow {
  id: string;
  text: string;
  normalized_text: string;
  language: string;
  expression_type: Expression['expressionType'];
  created_at: number;
  [key: string]: unknown;
}

interface OccurrenceRow {
  id: string;
  learning_object_id: string;
  content_id: string;
  content_version_id: string;
  locator_json: string;
  context_text: string;
  created_at: number;
  [key: string]: unknown;
}

interface ReviewItemRow {
  id: string;
  learning_object_id: string;
  policy_id: string;
  created_at: number;
  [key: string]: unknown;
}

interface ReviewEventRow {
  id: string;
  review_item_id: string;
  attempt_key: string;
  rating: ReviewRating;
  occurred_at: number;
  [key: string]: unknown;
}

interface ScheduleRow {
  review_item_id: string;
  due_at: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  state: MemoryState;
  elapsed_days: number | null;
  learning_steps: number | null;
  reps: number | null;
  lapses: number | null;
  last_review_at: number | null;
  [key: string]: unknown;
}

interface LearningEventRow {
  id: string;
  type: LearningEventType;
  contract_version: string;
  occurred_at: number;
  client_session_id: string;
  actor_id: string | null;
  aggregate_id: string | null;
  properties_json: string;
  [key: string]: unknown;
}

interface TodayPlanRow {
  id: string;
  date: string;
  generated_at: number;
  items_json: string;
  [key: string]: unknown;
}

const toLearningObject = (row: LearningObjectRow): SavedLearningObject => ({
  id: row.id,
  kind: row.kind,
  text: row.text,
  normalizedText: row.normalized_text,
  language: row.language,
  ...(row.lexeme_id ? { lexemeId: row.lexeme_id } : {}),
  ...(row.sense_id ? { senseId: row.sense_id } : {}),
  ...(row.expression_id ? { expressionId: row.expression_id } : {}),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toLexeme = (row: LexemeRow): Lexeme => ({
  id: row.id,
  lemma: row.lemma,
  normalizedLemma: row.normalized_lemma,
  language: row.language,
  ...(row.part_of_speech ? { partOfSpeech: row.part_of_speech } : {}),
  createdAt: new Date(row.created_at),
});

const toForm = (row: FormRow): Form => ({
  id: row.id,
  lexemeId: row.lexeme_id,
  text: row.text,
  normalizedText: row.normalized_text,
  language: row.language,
  formType: row.form_type,
  createdAt: new Date(row.created_at),
});

const toSense = (row: SenseRow): Sense => ({
  id: row.id,
  lexemeId: row.lexeme_id,
  ...(row.definition ? { definition: row.definition } : {}),
  ...(row.definition_language ? { definitionLanguage: row.definition_language } : {}),
  ...(row.part_of_speech ? { partOfSpeech: row.part_of_speech } : {}),
  status: row.status,
  createdAt: new Date(row.created_at),
});

const toExpression = (row: ExpressionRow): Expression => ({
  id: row.id,
  text: row.text,
  normalizedText: row.normalized_text,
  language: row.language,
  expressionType: row.expression_type,
  createdAt: new Date(row.created_at),
});

const toOccurrence = (row: OccurrenceRow): Occurrence => ({
  id: row.id,
  learningObjectId: row.learning_object_id,
  contentId: row.content_id,
  contentVersionId: row.content_version_id,
  locator: locatorSchema.parse(JSON.parse(row.locator_json)),
  contextText: row.context_text,
  createdAt: new Date(row.created_at),
});

const toReviewItem = (row: ReviewItemRow): ReviewItem => ({
  id: row.id,
  learningObjectId: row.learning_object_id,
  policyId: row.policy_id,
  createdAt: new Date(row.created_at),
});

const toReviewEvent = (row: ReviewEventRow): MemoryReviewEvent => ({
  id: row.id,
  reviewItemId: row.review_item_id,
  attemptKey: row.attempt_key,
  rating: row.rating,
  occurredAt: new Date(row.occurred_at),
});

const toSchedule = (row: ScheduleRow): Schedule => ({
  reviewItemId: row.review_item_id,
  dueAt: new Date(row.due_at),
  stability: row.stability,
  difficulty: row.difficulty,
  scheduledDays: row.scheduled_days,
  state: row.state,
  elapsedDays: row.elapsed_days ?? undefined,
  learningSteps: row.learning_steps ?? undefined,
  reps: row.reps ?? undefined,
  lapses: row.lapses ?? undefined,
  lastReviewAt: row.last_review_at === null ? undefined : new Date(row.last_review_at),
});

const restorePlanItems = (itemsJson: string): TodayPlanItem[] => {
  const raw = JSON.parse(itemsJson) as Array<Record<string, unknown>>;
  return raw.map((item) => {
    if (item['kind'] === 'review') {
      return {
        id: String(item['id']),
        kind: 'review',
        reviewItemId: String(item['reviewItemId']),
        dueAt: new Date(String(item['dueAt'])),
      };
    }
    if (item['kind'] === 'recent-save') {
      return {
        id: String(item['id']),
        kind: 'recent-save',
        learningObjectId: String(item['learningObjectId']),
        createdAt: new Date(String(item['createdAt'])),
      };
    }
    if (item['kind'] === 'continue-reading') {
      return {
        id: String(item['id']),
        kind: 'continue-reading',
        contentId: String(item['contentId']),
        locator: item['locator'] ? locatorSchema.parse(item['locator']) : undefined,
      };
    }
    return {
      id: String(item['id']),
      kind: 'optional-practice',
      learningObjectId: String(item['learningObjectId']),
      activity:
        item['activity'] === 'typing' ||
        item['activity'] === 'spelling' ||
        item['activity'] === 'cloze'
          ? item['activity']
          : 'recognition',
    };
  });
};

const toTodayPlan = (row: TodayPlanRow): TodayPlan => ({
  id: row.id,
  date: row.date,
  generatedAt: new Date(row.generated_at),
  items: restorePlanItems(row.items_json),
});

const restoreProvider = (providerJson: string): Artifact['provider'] => {
  const provider: unknown = JSON.parse(providerJson);
  if (!provider || typeof provider !== 'object') {
    throw new Error('Stored Artifact provider metadata is invalid');
  }
  const values = provider as Record<string, unknown>;
  if (typeof values['id'] !== 'string' || typeof values['version'] !== 'string') {
    throw new Error('Stored Artifact provider identity is invalid');
  }
  if (values['model'] !== undefined && typeof values['model'] !== 'string') {
    throw new Error('Stored Artifact provider model is invalid');
  }
  if (values['region'] !== undefined && typeof values['region'] !== 'string') {
    throw new Error('Stored Artifact provider region is invalid');
  }
  return {
    id: values['id'],
    version: values['version'],
    ...(values['model'] ? { model: values['model'] } : {}),
    ...(values['region'] ? { region: values['region'] } : {}),
  };
};

const toArtifact = (row: ArtifactRow): Artifact => ({
  id: row.id,
  actionId: row.action_id,
  selection: selectionContextSchema.parse(JSON.parse(row.selection_json)),
  kind: row.kind,
  content: row.content,
  language: row.language,
  provider: restoreProvider(row.provider_json),
  createdAt: new Date(row.created_at),
});

export class ReadestLearningDatabaseAdapter
  implements
    LexiconRepositoryPort,
    ActivityRepositoryPort,
    MemoryRepositoryPort,
    LearningPlanPort,
    LearningEventPort,
    ArtifactCachePort,
    LearningIdentityRepositoryPort
{
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: DatabaseService) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  upsertLearningObject(
    candidate: SavedLearningObject,
    candidateGraph: LexicalGraph,
    occurrence: Occurrence,
  ): Promise<{
    learningObject: SavedLearningObject;
    created: boolean;
    occurrenceCreated: boolean;
  }> {
    assertLexicalGraph(candidate, candidateGraph);
    return this.enqueue(async () => {
      await this.db.execute('BEGIN IMMEDIATE');
      try {
        const existingRows = await this.db.select<LearningObjectRow>(
          `SELECT * FROM learning_objects
           WHERE kind = ? AND language = ? AND normalized_text = ?`,
          [candidate.kind, candidate.language, candidate.normalizedText],
        );
        const existing = existingRows[0];
        if (existing) {
          const occurrenceCreated = await this.insertOccurrence(existing.id, occurrence);
          await this.db.execute('COMMIT');
          return {
            learningObject: toLearningObject(existing),
            created: false,
            occurrenceCreated,
          };
        }

        let learningObject: SavedLearningObject;
        if (candidate.kind === 'word' || candidate.kind === 'sense') {
          const proposedLexeme = candidateGraph.lexeme!;
          await this.db.execute(
            `INSERT INTO learning_lexemes
              (id, lemma, normalized_lemma, language, part_of_speech, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(language, normalized_lemma) DO NOTHING`,
            [
              proposedLexeme.id,
              proposedLexeme.lemma,
              proposedLexeme.normalizedLemma,
              proposedLexeme.language,
              proposedLexeme.partOfSpeech ?? null,
              proposedLexeme.createdAt.getTime(),
            ],
          );
          const lexemeRows = await this.db.select<LexemeRow>(
            `SELECT * FROM learning_lexemes
             WHERE language = ? AND normalized_lemma = ?`,
            [proposedLexeme.language, proposedLexeme.normalizedLemma],
          );
          const lexeme = toLexeme(lexemeRows[0]!);

          for (const form of candidateGraph.forms) {
            await this.db.execute(
              `INSERT INTO learning_forms
                (id, lexeme_id, text, normalized_text, language, form_type, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(lexeme_id, language, normalized_text, form_type) DO NOTHING`,
              [
                form.id,
                lexeme.id,
                form.text,
                form.normalizedText,
                form.language,
                form.formType,
                form.createdAt.getTime(),
              ],
            );
          }

          let senseId: string | undefined;
          if (candidateGraph.sense) {
            const sense = candidateGraph.sense;
            await this.db.execute(
              `INSERT INTO learning_senses
                (id, lexeme_id, definition, definition_language, part_of_speech, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                sense.id,
                lexeme.id,
                sense.definition ?? null,
                sense.definitionLanguage ?? null,
                sense.partOfSpeech ?? null,
                sense.status,
                sense.createdAt.getTime(),
              ],
            );
            senseId = sense.id;
          }

          learningObject = {
            ...candidate,
            lexemeId: lexeme.id,
            ...(senseId ? { senseId } : {}),
          };
        } else {
          const proposedExpression = candidateGraph.expression;
          if (!proposedExpression || proposedExpression.expressionType !== candidate.kind) {
            throw new Error(`${candidate.kind} requires a matching Expression node`);
          }
          await this.db.execute(
            `INSERT INTO learning_expressions
              (id, text, normalized_text, language, expression_type, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(expression_type, language, normalized_text) DO NOTHING`,
            [
              proposedExpression.id,
              proposedExpression.text,
              proposedExpression.normalizedText,
              proposedExpression.language,
              proposedExpression.expressionType,
              proposedExpression.createdAt.getTime(),
            ],
          );
          const expressionRows = await this.db.select<ExpressionRow>(
            `SELECT * FROM learning_expressions
             WHERE expression_type = ? AND language = ? AND normalized_text = ?`,
            [candidate.kind, proposedExpression.language, proposedExpression.normalizedText],
          );
          learningObject = { ...candidate, expressionId: expressionRows[0]!.id };
        }

        const insert = await this.db.execute(
          `INSERT INTO learning_objects
            (id, kind, text, normalized_text, language, lexeme_id, sense_id, expression_id,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            learningObject.id,
            learningObject.kind,
            learningObject.text,
            learningObject.normalizedText,
            learningObject.language,
            learningObject.lexemeId ?? null,
            learningObject.senseId ?? null,
            learningObject.expressionId ?? null,
            learningObject.createdAt.getTime(),
            learningObject.updatedAt.getTime(),
          ],
        );
        const occurrenceCreated = await this.insertOccurrence(learningObject.id, occurrence);
        await this.db.execute('COMMIT');
        return {
          learningObject,
          created: insert.rowsAffected > 0,
          occurrenceCreated,
        };
      } catch (error) {
        await this.db.execute('ROLLBACK');
        throw error;
      }
    });
  }

  private async insertOccurrence(
    learningObjectId: string,
    occurrence: Occurrence,
  ): Promise<boolean> {
    const locatorJson = JSON.stringify(occurrence.locator);
    const insert = await this.db.execute(
      `INSERT INTO learning_occurrences
        (id, learning_object_id, content_id, content_version_id, locator_json, locator_key, context_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(learning_object_id, locator_key) DO NOTHING`,
      [
        occurrence.id,
        learningObjectId,
        occurrence.contentId,
        occurrence.contentVersionId,
        locatorJson,
        locatorJson,
        occurrence.contextText,
        occurrence.createdAt.getTime(),
      ],
    );
    return insert.rowsAffected > 0;
  }

  async getLearningObject(id: string): Promise<SavedLearningObject | null> {
    const rows = await this.db.select<LearningObjectRow>(
      'SELECT * FROM learning_objects WHERE id = ?',
      [id],
    );
    return rows[0] ? toLearningObject(rows[0]) : null;
  }

  async getLexicalGraph(learningObjectId: string): Promise<LexicalGraph | null> {
    const learningObject = await this.getLearningObject(learningObjectId);
    if (!learningObject) return null;

    const graph: LexicalGraph = { forms: [] };
    if (learningObject.lexemeId) {
      const lexemeRows = await this.db.select<LexemeRow>(
        'SELECT * FROM learning_lexemes WHERE id = ?',
        [learningObject.lexemeId],
      );
      if (!lexemeRows[0]) throw new Error(`Lexeme "${learningObject.lexemeId}" is missing`);
      graph.lexeme = toLexeme(lexemeRows[0]);
      const formRows = await this.db.select<FormRow>(
        'SELECT * FROM learning_forms WHERE lexeme_id = ? ORDER BY created_at, id',
        [learningObject.lexemeId],
      );
      graph.forms = formRows.map(toForm);
    }
    if (learningObject.senseId) {
      const senseRows = await this.db.select<SenseRow>(
        'SELECT * FROM learning_senses WHERE id = ?',
        [learningObject.senseId],
      );
      if (!senseRows[0]) throw new Error(`Sense "${learningObject.senseId}" is missing`);
      graph.sense = toSense(senseRows[0]);
    }
    if (learningObject.expressionId) {
      const expressionRows = await this.db.select<ExpressionRow>(
        'SELECT * FROM learning_expressions WHERE id = ?',
        [learningObject.expressionId],
      );
      if (!expressionRows[0]) {
        throw new Error(`Expression "${learningObject.expressionId}" is missing`);
      }
      graph.expression = toExpression(expressionRows[0]);
    }
    return graph;
  }

  async listRecent(limit: number): Promise<readonly SavedLearningObject[]> {
    if (limit <= 0) return [];
    const rows = await this.db.select<LearningObjectRow>(
      'SELECT * FROM learning_objects ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
    return rows.map(toLearningObject);
  }

  async listOccurrences(learningObjectId: string): Promise<readonly Occurrence[]> {
    const rows = await this.db.select<OccurrenceRow>(
      'SELECT * FROM learning_occurrences WHERE learning_object_id = ? ORDER BY created_at',
      [learningObjectId],
    );
    return rows.map(toOccurrence);
  }

  async getSpec(id: string): Promise<ActivitySpec | null> {
    const rows = await this.db.select<ActivitySpecRow>(
      'SELECT * FROM learning_activity_specs WHERE id = ?',
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      learningObjectId: row.learning_object_id,
      prompt: row.prompt,
      answer: row.answer,
      ...(row.source_locator_json
        ? { sourceLocator: locatorSchema.parse(JSON.parse(row.source_locator_json)) }
        : {}),
    };
  }

  async saveSpec(spec: ActivitySpec): Promise<void> {
    await this.db.execute(
      `INSERT INTO learning_activity_specs
        (id, kind, learning_object_id, prompt, answer, source_locator_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        spec.id,
        spec.kind,
        spec.learningObjectId,
        spec.prompt,
        spec.answer,
        spec.sourceLocator ? JSON.stringify(spec.sourceLocator) : null,
      ],
    );
  }

  saveAttempt(attempt: ActivityAttempt, result: ActivityResult): Promise<void> {
    return this.enqueue(async () => {
      await this.db.execute('BEGIN IMMEDIATE');
      try {
        await this.db.execute(
          `INSERT INTO learning_activity_attempts
            (id, activity_id, learning_object_id, response, started_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          [
            attempt.id,
            attempt.activityId,
            attempt.learningObjectId,
            attempt.response,
            attempt.startedAt.getTime(),
            attempt.completedAt?.getTime() ?? null,
          ],
        );
        await this.db.execute(
          `INSERT INTO learning_activity_results
            (attempt_id, correct, score, duration_ms, completed_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(attempt_id) DO NOTHING`,
          [
            result.attemptId,
            result.correct ? 1 : 0,
            result.score,
            result.durationMs,
            result.completedAt.getTime(),
          ],
        );
        await this.db.execute('COMMIT');
      } catch (error) {
        await this.db.execute('ROLLBACK');
        throw error;
      }
    });
  }

  async getReviewItem(id: string): Promise<ReviewItem | null> {
    const rows = await this.db.select<ReviewItemRow>(
      'SELECT * FROM learning_review_items WHERE id = ?',
      [id],
    );
    return rows[0] ? toReviewItem(rows[0]) : null;
  }

  async findReviewItemByLearningObject(learningObjectId: string): Promise<ReviewItem | null> {
    const rows = await this.db.select<ReviewItemRow>(
      'SELECT * FROM learning_review_items WHERE learning_object_id = ?',
      [learningObjectId],
    );
    return rows[0] ? toReviewItem(rows[0]) : null;
  }

  saveReviewItem(item: ReviewItem): Promise<ReviewItem> {
    return this.enqueue(async () => {
      await this.db.execute(
        `INSERT INTO learning_review_items (id, learning_object_id, policy_id, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(learning_object_id) DO NOTHING`,
        [item.id, item.learningObjectId, item.policyId, item.createdAt.getTime()],
      );
      const rows = await this.db.select<ReviewItemRow>(
        'SELECT * FROM learning_review_items WHERE learning_object_id = ?',
        [item.learningObjectId],
      );
      return toReviewItem(rows[0]!);
    });
  }

  appendReviewEvent(
    event: MemoryReviewEvent,
  ): Promise<{ event: MemoryReviewEvent; created: boolean }> {
    return this.enqueue(async () => {
      const insert = await this.db.execute(
        `INSERT INTO learning_review_events (id, review_item_id, attempt_key, rating, occurred_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(attempt_key) DO NOTHING`,
        [event.id, event.reviewItemId, event.attemptKey, event.rating, event.occurredAt.getTime()],
      );
      const rows = await this.db.select<ReviewEventRow>(
        'SELECT * FROM learning_review_events WHERE attempt_key = ?',
        [event.attemptKey],
      );
      return { event: toReviewEvent(rows[0]!), created: insert.rowsAffected > 0 };
    });
  }

  async listReviewEvents(reviewItemId: string): Promise<readonly MemoryReviewEvent[]> {
    const rows = await this.db.select<ReviewEventRow>(
      'SELECT * FROM learning_review_events WHERE review_item_id = ? ORDER BY occurred_at',
      [reviewItemId],
    );
    return rows.map(toReviewEvent);
  }

  async saveSchedule(schedule: Schedule): Promise<void> {
    await this.db.execute(
      `INSERT INTO learning_schedules
        (review_item_id, due_at, stability, difficulty, scheduled_days, state,
         elapsed_days, learning_steps, reps, lapses, last_review_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(review_item_id) DO UPDATE SET
         due_at = excluded.due_at,
         stability = excluded.stability,
         difficulty = excluded.difficulty,
         scheduled_days = excluded.scheduled_days,
         state = excluded.state,
         elapsed_days = excluded.elapsed_days,
         learning_steps = excluded.learning_steps,
         reps = excluded.reps,
         lapses = excluded.lapses,
         last_review_at = excluded.last_review_at`,
      [
        schedule.reviewItemId,
        schedule.dueAt.getTime(),
        schedule.stability,
        schedule.difficulty,
        schedule.scheduledDays,
        schedule.state,
        schedule.elapsedDays ?? null,
        schedule.learningSteps ?? null,
        schedule.reps ?? null,
        schedule.lapses ?? null,
        schedule.lastReviewAt?.getTime() ?? null,
      ],
    );
  }

  async getSchedule(reviewItemId: string): Promise<Schedule | null> {
    const rows = await this.db.select<ScheduleRow>(
      'SELECT * FROM learning_schedules WHERE review_item_id = ?',
      [reviewItemId],
    );
    return rows[0] ? toSchedule(rows[0]) : null;
  }

  async listDue(at: Date): Promise<readonly { reviewItem: ReviewItem; schedule: Schedule }[]> {
    const rows = await this.db.select<ReviewItemRow & ScheduleRow>(
      `SELECT i.id, i.learning_object_id, i.policy_id, i.created_at, s.*
       FROM learning_review_items i
       JOIN learning_schedules s ON s.review_item_id = i.id
       WHERE s.due_at <= ?
       ORDER BY s.due_at`,
      [at.getTime()],
    );
    return rows.map((row) => ({ reviewItem: toReviewItem(row), schedule: toSchedule(row) }));
  }

  async save(plan: TodayPlan): Promise<void> {
    await this.db.execute(
      `INSERT INTO learning_today_plans (id, date, generated_at, items_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         id = excluded.id, generated_at = excluded.generated_at, items_json = excluded.items_json`,
      [plan.id, plan.date, plan.generatedAt.getTime(), JSON.stringify(plan.items)],
    );
  }

  async get(id: string): Promise<TodayPlan | null> {
    const rows = await this.db.select<TodayPlanRow>(
      'SELECT * FROM learning_today_plans WHERE id = ?',
      [id],
    );
    return rows[0] ? toTodayPlan(rows[0]) : null;
  }

  async getByDate(date: string): Promise<TodayPlan | null> {
    const rows = await this.db.select<TodayPlanRow>(
      'SELECT * FROM learning_today_plans WHERE date = ?',
      [date],
    );
    return rows[0] ? toTodayPlan(rows[0]) : null;
  }

  async getArtifact(key: string): Promise<Artifact | null> {
    const rows = await this.db.select<ArtifactRow>(
      'SELECT * FROM learning_artifacts WHERE cache_key = ?',
      [key],
    );
    return rows[0] ? toArtifact(rows[0]) : null;
  }

  async putArtifact(key: string, artifact: Artifact): Promise<void> {
    await this.db.execute(
      `INSERT INTO learning_artifacts
        (cache_key, id, action_id, selection_json, kind, content, language, provider_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO NOTHING`,
      [
        key,
        artifact.id,
        artifact.actionId,
        JSON.stringify(artifact.selection),
        artifact.kind,
        artifact.content,
        artifact.language,
        JSON.stringify(artifact.provider),
        artifact.createdAt.getTime(),
      ],
    );
  }

  async publish(event: LearningEvent): Promise<void> {
    const validEvent = learningEventSchema.parse(event);
    await this.db.execute(
      `INSERT INTO learning_events
        (id, contract_version, type, occurred_at, client_session_id, actor_id, aggregate_id, properties_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        validEvent.id,
        validEvent.contractVersion,
        validEvent.type,
        validEvent.occurredAt.getTime(),
        validEvent.clientSessionId,
        validEvent.actorId ?? null,
        validEvent.aggregateId ?? null,
        JSON.stringify(validEvent.properties),
      ],
    );
  }

  async list(): Promise<readonly LearningEvent[]> {
    const rows = await this.db.select<LearningEventRow>(
      'SELECT * FROM learning_events ORDER BY occurred_at, id',
    );
    return rows.map((row) =>
      learningEventSchema.parse({
        id: row.id,
        contractVersion: row.contract_version,
        type: row.type,
        occurredAt: new Date(row.occurred_at),
        clientSessionId: row.client_session_id,
        ...(row.actor_id ? { actorId: row.actor_id } : {}),
        ...(row.aggregate_id ? { aggregateId: row.aggregate_id } : {}),
        properties: JSON.parse(row.properties_json),
      }),
    );
  }

  getOrCreateGuestId(candidateId: string): Promise<string> {
    return this.enqueue(async () => {
      await this.db.execute(
        `INSERT INTO learning_identity_state (key, value, updated_at)
         VALUES ('guest_id', ?, ?)
         ON CONFLICT(key) DO NOTHING`,
        [candidateId, Date.now()],
      );
      const rows = await this.db.select<{ value: string }>(
        "SELECT value FROM learning_identity_state WHERE key = 'guest_id'",
      );
      return rows[0]!.value;
    });
  }

  linkGuestIdentity(guestId: string, subjectId: string, linkedAt: Date): Promise<void> {
    return this.enqueue(async () => {
      await this.db.execute(
        `INSERT INTO learning_identity_links (guest_id, subject_id, linked_at)
         VALUES (?, ?, ?)
         ON CONFLICT(guest_id) DO NOTHING`,
        [guestId, subjectId, linkedAt.getTime()],
      );
      const linkedSubject = await this.getLinkedSubject(guestId);
      if (linkedSubject !== subjectId) {
        throw new Error(`Guest identity "${guestId}" is already linked to another account`);
      }
    });
  }

  async getLinkedSubject(guestId: string): Promise<string | null> {
    const rows = await this.db.select<{ subject_id: string }>(
      'SELECT subject_id FROM learning_identity_links WHERE guest_id = ?',
      [guestId],
    );
    return rows[0]?.subject_id ?? null;
  }
}
