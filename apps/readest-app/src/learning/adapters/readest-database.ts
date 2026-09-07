import type { DatabaseService } from '@/types/database';
import { locatorSchema } from '../contracts';
import type {
  LearningEvent,
  LearningEventType,
  MemoryReviewEvent,
  MemoryState,
  Occurrence,
  ReviewItem,
  ReviewRating,
  SavedLearningObject,
  Schedule,
  TodayPlan,
  TodayPlanItem,
} from '../domain';
import type {
  LearningEventPort,
  LearningPlanPort,
  LexiconRepositoryPort,
  MemoryRepositoryPort,
} from '../ports';

interface LearningObjectRow {
  id: string;
  kind: SavedLearningObject['kind'];
  text: string;
  normalized_text: string;
  language: string;
  created_at: number;
  updated_at: number;
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
  occurred_at: number;
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
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
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

export class ReadestLearningDatabaseAdapter
  implements LexiconRepositoryPort, MemoryRepositoryPort, LearningPlanPort, LearningEventPort
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
    occurrence: Occurrence,
  ): Promise<{
    learningObject: SavedLearningObject;
    created: boolean;
    occurrenceCreated: boolean;
  }> {
    return this.enqueue(async () => {
      const insert = await this.db.execute(
        `INSERT INTO learning_objects
          (id, kind, text, normalized_text, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind, language, normalized_text) DO NOTHING`,
        [
          candidate.id,
          candidate.kind,
          candidate.text,
          candidate.normalizedText,
          candidate.language,
          candidate.createdAt.getTime(),
          candidate.updatedAt.getTime(),
        ],
      );
      const rows = await this.db.select<LearningObjectRow>(
        `SELECT * FROM learning_objects
         WHERE kind = ? AND language = ? AND normalized_text = ?`,
        [candidate.kind, candidate.language, candidate.normalizedText],
      );
      const learningObject = toLearningObject(rows[0]!);
      const locatorJson = JSON.stringify(occurrence.locator);
      const occurrenceInsert = await this.db.execute(
        `INSERT INTO learning_occurrences
          (id, learning_object_id, content_id, content_version_id, locator_json, locator_key, context_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(learning_object_id, locator_key) DO NOTHING`,
        [
          occurrence.id,
          learningObject.id,
          occurrence.contentId,
          occurrence.contentVersionId,
          locatorJson,
          locatorJson,
          occurrence.contextText,
          occurrence.createdAt.getTime(),
        ],
      );
      return {
        learningObject,
        created: insert.rowsAffected > 0,
        occurrenceCreated: occurrenceInsert.rowsAffected > 0,
      };
    });
  }

  async getLearningObject(id: string): Promise<SavedLearningObject | null> {
    const rows = await this.db.select<LearningObjectRow>(
      'SELECT * FROM learning_objects WHERE id = ?',
      [id],
    );
    return rows[0] ? toLearningObject(rows[0]) : null;
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

  async publish(event: LearningEvent): Promise<void> {
    await this.db.execute(
      `INSERT INTO learning_events
        (id, type, occurred_at, actor_id, aggregate_id, properties_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        event.id,
        event.type,
        event.occurredAt.getTime(),
        event.actorId ?? null,
        event.aggregateId ?? null,
        JSON.stringify(event.properties),
      ],
    );
  }

  async list(): Promise<readonly LearningEvent[]> {
    const rows = await this.db.select<LearningEventRow>(
      'SELECT * FROM learning_events ORDER BY occurred_at, id',
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      occurredAt: new Date(row.occurred_at),
      actorId: row.actor_id ?? undefined,
      aggregateId: row.aggregate_id ?? undefined,
      properties: JSON.parse(row.properties_json) as LearningEvent['properties'],
    }));
  }
}
