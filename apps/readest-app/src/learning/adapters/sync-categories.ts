import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import {
  activitySyncPayloadSchema,
  lexiconSyncPayloadSchema,
  memorySyncPayloadSchema,
  parseLearningEventSyncPayload,
} from '../contracts';
import {
  LEARNING_SYNC_CONTRACT_VERSION,
  type LearningObjectIdentity,
  type LearningSyncCategoryDescriptor,
  type LearningSyncRecord,
  type LearningEvent,
} from '../domain';
import type {
  ActivityRepositoryPort,
  LearningEventPort,
  LearningSyncCategoryPort,
  LexiconRepositoryPort,
  MemoryRepositoryPort,
  MemorySchedulerPort,
} from '../ports';

const stableRecordId = (category: string, identity: string): string =>
  `${category}:${bytesToHex(sha256(utf8ToBytes(identity)))}`;

const identityOf = (learningObject: {
  kind: LearningObjectIdentity['kind'];
  language: string;
  normalizedText: string;
}): LearningObjectIdentity => ({
  kind: learningObject.kind,
  language: learningObject.language,
  normalizedText: learningObject.normalizedText,
});

const identityKey = (identity: LearningObjectIdentity): string =>
  `${identity.kind}\u0000${identity.language.toLowerCase()}\u0000${identity.normalizedText}`;

const newestIso = (dates: readonly Date[]): string =>
  new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();

const compact = <T>(values: readonly (T | null)[]): T[] =>
  values.filter((value): value is T => value !== null);

const descriptor = (
  value: Omit<LearningSyncCategoryDescriptor, 'contractVersion' | 'privacy'>,
): LearningSyncCategoryDescriptor => ({
  ...value,
  contractVersion: LEARNING_SYNC_CONTRACT_VERSION,
  privacy: 'private-encrypted',
});

export const LEXICON_SYNC_DESCRIPTOR = descriptor({
  id: 'learning.lexicon',
  mergeStrategy: 'canonical-aggregate',
  dependencies: [],
});

export const MEMORY_SYNC_DESCRIPTOR = descriptor({
  id: 'learning.memory',
  mergeStrategy: 'append-only',
  dependencies: ['learning.lexicon'],
});

export const ACTIVITY_SYNC_DESCRIPTOR = descriptor({
  id: 'learning.activity',
  mergeStrategy: 'append-only',
  dependencies: ['learning.lexicon'],
});

export const LEARNING_EVENT_SYNC_DESCRIPTOR = descriptor({
  id: 'learning.events',
  mergeStrategy: 'append-only',
  dependencies: ['learning.lexicon', 'learning.memory'],
});

export class LexiconSyncCategoryAdapter implements LearningSyncCategoryPort {
  readonly descriptor = LEXICON_SYNC_DESCRIPTOR;

  constructor(private readonly lexicon: LexiconRepositoryPort) {}

  async collect(): Promise<readonly LearningSyncRecord[]> {
    const learningObjects = await this.lexicon.listAll();
    const records = await Promise.all(
      learningObjects.map(async (learningObject) => {
        const graph = await this.lexicon.getLexicalGraph(learningObject.id);
        const occurrences = await this.lexicon.listOccurrences(learningObject.id);
        if (!graph) return [];
        const identity = identityOf(learningObject);
        return occurrences.map(
          (occurrence) =>
            ({
              id: stableRecordId(
                this.descriptor.id,
                `${identityKey(identity)}\u0000${occurrence.contentId}\u0000${occurrence.contentVersionId}\u0000${JSON.stringify(occurrence.locator)}`,
              ),
              category: this.descriptor.id,
              contractVersion: this.descriptor.contractVersion,
              updatedAt: newestIso([learningObject.updatedAt, occurrence.createdAt]),
              payload: { learningObject, graph, occurrences: [occurrence] },
            }) satisfies LearningSyncRecord,
        );
      }),
    );
    return records.flat();
  }

  async apply(
    records: readonly LearningSyncRecord[],
  ): Promise<{ applied: number; ignored: number }> {
    let applied = 0;
    let ignored = 0;
    for (const record of records) {
      if (record.deletedAt) {
        ignored += 1;
        continue;
      }
      const payload = lexiconSyncPayloadSchema.parse(record.payload);
      let changed = false;
      for (const occurrence of payload.occurrences) {
        const result = await this.lexicon.upsertLearningObject(
          payload.learningObject,
          payload.graph,
          occurrence,
        );
        changed ||= result.created || result.occurrenceCreated;
      }
      if (changed) applied += 1;
      else ignored += 1;
    }
    return { applied, ignored };
  }
}

export class MemorySyncCategoryAdapter implements LearningSyncCategoryPort {
  readonly descriptor = MEMORY_SYNC_DESCRIPTOR;

  constructor(
    private readonly lexicon: LexiconRepositoryPort,
    private readonly memory: MemoryRepositoryPort,
    private readonly scheduler: MemorySchedulerPort,
  ) {}

  async collect(): Promise<readonly LearningSyncRecord[]> {
    const items = await this.memory.listReviewItems();
    const records = await Promise.all(
      items.map(async (reviewItem) => {
        const learningObject = await this.lexicon.getLearningObject(reviewItem.learningObjectId);
        if (!learningObject) return null;
        const reviewEvents = await this.memory.listReviewEvents(reviewItem.id);
        const identity = identityOf(learningObject);
        const facts = reviewEvents.length > 0 ? reviewEvents : [null];
        return facts.map(
          (event) =>
            ({
              id: stableRecordId(
                this.descriptor.id,
                `${identityKey(identity)}\u0000${event?.attemptKey ?? 'seed'}`,
              ),
              category: this.descriptor.id,
              contractVersion: this.descriptor.contractVersion,
              updatedAt: (event?.occurredAt ?? reviewItem.createdAt).toISOString(),
              payload: {
                learningObject: identity,
                reviewItem,
                reviewEvents: event ? [event] : [],
              },
            }) satisfies LearningSyncRecord,
        );
      }),
    );
    return compact(records).flat();
  }

  async apply(
    records: readonly LearningSyncRecord[],
  ): Promise<{ applied: number; ignored: number }> {
    let applied = 0;
    let ignored = 0;
    for (const record of records) {
      if (record.deletedAt) {
        ignored += 1;
        continue;
      }
      const payload = memorySyncPayloadSchema.parse(record.payload);
      const learningObject = await this.lexicon.findLearningObject(payload.learningObject);
      if (!learningObject) {
        throw new Error(`Memory sync requires lexical dependency for record "${record.id}"`);
      }
      const existingItem = await this.memory.findReviewItemByLearningObject(learningObject.id);
      const item = await this.memory.saveReviewItem({
        ...payload.reviewItem,
        learningObjectId: learningObject.id,
      });
      let changed = existingItem === null;
      for (const event of payload.reviewEvents) {
        const result = await this.memory.appendReviewEvent({ ...event, reviewItemId: item.id });
        changed ||= result.created;
      }
      if (changed || !(await this.memory.getSchedule(item.id))) {
        await this.rebuildSchedule(item);
        applied += 1;
      } else {
        ignored += 1;
      }
    }
    return { applied, ignored };
  }

  private async rebuildSchedule(item: Awaited<ReturnType<MemoryRepositoryPort['saveReviewItem']>>) {
    const events = [...(await this.memory.listReviewEvents(item.id))].sort((left, right) =>
      left.occurredAt.getTime() === right.occurredAt.getTime()
        ? left.id.localeCompare(right.id)
        : left.occurredAt.getTime() - right.occurredAt.getTime(),
    );
    if (events.length === 0) {
      await this.memory.saveSchedule({
        reviewItemId: item.id,
        dueAt: item.createdAt,
        stability: 0,
        difficulty: 0,
        scheduledDays: 0,
        state: 'new',
      });
      return;
    }
    let schedule;
    for (const event of events) {
      schedule = await this.scheduler.schedule(item, event, schedule);
    }
    await this.memory.saveSchedule(schedule!);
  }
}

export class ActivitySyncCategoryAdapter implements LearningSyncCategoryPort {
  readonly descriptor = ACTIVITY_SYNC_DESCRIPTOR;

  constructor(
    private readonly lexicon: LexiconRepositoryPort,
    private readonly activities: ActivityRepositoryPort,
  ) {}

  async collect(): Promise<readonly LearningSyncRecord[]> {
    const specs = await this.activities.listSpecs();
    const records = await Promise.all(
      specs.map(async (spec) => {
        const learningObject = await this.lexicon.getLearningObject(spec.learningObjectId);
        if (!learningObject) return null;
        const attempts = await this.activities.listAttempts(spec.id);
        const identity = identityOf(learningObject);
        const facts = attempts.length > 0 ? attempts : [null];
        return facts.map(
          (attempt) =>
            ({
              id: stableRecordId(
                this.descriptor.id,
                `${identityKey(identity)}\u0000${spec.kind}\u0000${attempt?.attempt.id ?? 'seed'}`,
              ),
              category: this.descriptor.id,
              contractVersion: this.descriptor.contractVersion,
              updatedAt: (attempt?.result.completedAt ?? learningObject.updatedAt).toISOString(),
              payload: {
                learningObject: identity,
                spec,
                attempts: attempt ? [attempt] : [],
              },
            }) satisfies LearningSyncRecord,
        );
      }),
    );
    return compact(records).flat();
  }

  async apply(
    records: readonly LearningSyncRecord[],
  ): Promise<{ applied: number; ignored: number }> {
    let applied = 0;
    let ignored = 0;
    for (const record of records) {
      if (record.deletedAt) {
        ignored += 1;
        continue;
      }
      const payload = activitySyncPayloadSchema.parse(record.payload);
      const learningObject = await this.lexicon.findLearningObject(payload.learningObject);
      if (!learningObject) {
        throw new Error(`Activity sync requires lexical dependency for record "${record.id}"`);
      }
      const existing = await this.activities.findSpecByLearningObject(
        learningObject.id,
        payload.spec.kind,
      );
      const spec = existing ?? {
        ...payload.spec,
        learningObjectId: learningObject.id,
      };
      if (!existing) await this.activities.saveSpec(spec);
      const knownAttempts = new Set(
        (await this.activities.listAttempts(spec.id)).map(({ attempt }) => attempt.id),
      );
      let changed = !existing;
      for (const { attempt, result } of payload.attempts) {
        if (knownAttempts.has(attempt.id)) continue;
        await this.activities.saveAttempt(
          { ...attempt, activityId: spec.id, learningObjectId: learningObject.id },
          result,
        );
        changed = true;
      }
      if (changed) applied += 1;
      else ignored += 1;
    }
    return { applied, ignored };
  }
}

export class LearningEventSyncCategoryAdapter implements LearningSyncCategoryPort {
  readonly descriptor = LEARNING_EVENT_SYNC_DESCRIPTOR;

  constructor(
    private readonly lexicon: LexiconRepositoryPort,
    private readonly memory: MemoryRepositoryPort,
    private readonly events: LearningEventPort,
  ) {}

  async collect(): Promise<readonly LearningSyncRecord[]> {
    const events = await this.events.list();
    return Promise.all(
      events.map(async (event) => {
        const learningObject = await this.lexicon.getLearningObject(
          event.properties.memorySubjectId,
        );
        return {
          id: stableRecordId(this.descriptor.id, event.id),
          category: this.descriptor.id,
          contractVersion: this.descriptor.contractVersion,
          updatedAt: event.occurredAt.toISOString(),
          payload: {
            event,
            ...(learningObject ? { learningObject: identityOf(learningObject) } : {}),
          },
        } satisfies LearningSyncRecord;
      }),
    );
  }

  async apply(
    records: readonly LearningSyncRecord[],
  ): Promise<{ applied: number; ignored: number }> {
    const knownIds = new Set((await this.events.list()).map(({ id }) => id));
    let applied = 0;
    let ignored = 0;
    for (const record of records) {
      if (record.deletedAt) {
        ignored += 1;
        continue;
      }
      const payload = parseLearningEventSyncPayload(record.payload);
      if (knownIds.has(payload.event.id)) {
        ignored += 1;
        continue;
      }
      const event = await this.remapEvent(payload.event, payload.learningObject);
      await this.events.publish(event, { origin: 'sync' });
      knownIds.add(event.id);
      applied += 1;
    }
    return { applied, ignored };
  }

  private async remapEvent(
    event: LearningEvent,
    identity: LearningObjectIdentity | undefined,
  ): Promise<LearningEvent> {
    if (!identity) return event;
    const learningObject = await this.lexicon.findLearningObject(identity);
    if (!learningObject) throw new Error(`Learning event "${event.id}" is missing lexical data`);
    const aggregateId =
      event.type === 'memory_review_completed'
        ? (
            await this.memory.findReviewItemByLearningObject(learningObject.id)
          )?.id
        : learningObject.id;
    return {
      ...event,
      ...(aggregateId ? { aggregateId } : {}),
      properties: { ...event.properties, memorySubjectId: learningObject.id },
    } as LearningEvent;
  }
}
