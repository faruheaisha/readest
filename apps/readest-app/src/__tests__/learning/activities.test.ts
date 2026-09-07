import { describe, expect, it } from 'vitest';
import {
  createActivityEngines,
  InMemoryActivityAdapter,
  InMemoryLearningEventAdapter,
} from '@/learning/adapters';
import { ActivityPracticeService } from '@/learning/application';
import type { ActivityKind, Occurrence, SavedLearningObject } from '@/learning/domain';
import { ActivityRegistry } from '@/learning/kernel';

const learningObject: SavedLearningObject = {
  id: 'object-1',
  kind: 'expression',
  text: 'differential diagnosis',
  normalizedText: 'differential diagnosis',
  language: 'en',
  createdAt: new Date('2026-09-07T10:00:00.000Z'),
  updatedAt: new Date('2026-09-07T10:00:00.000Z'),
};

const occurrence: Occurrence = {
  id: 'occurrence-1',
  learningObjectId: learningObject.id,
  contentId: 'book-1',
  contentVersionId: 'book-1:1',
  locator: {
    href: 'chapter.xhtml',
    locations: { cfi: 'epubcfi(/6/2)' },
    text: { highlight: learningObject.text },
  },
  contextText: 'The differential diagnosis includes infection.',
  createdAt: new Date('2026-09-07T10:00:00.000Z'),
};

describe('activity plugins', () => {
  it('registers four independent engines behind one Activity port', () => {
    const registry = new ActivityRegistry();
    for (const engine of createActivityEngines()) registry.register(engine.kind, engine);

    const kinds: ActivityKind[] = ['recognition', 'typing', 'spelling', 'cloze'];
    expect(kinds.map((kind) => registry.require(kind).kind)).toEqual(kinds);
    expect(registry.require('cloze').createSpec('spec-1', learningObject, occurrence).prompt).toBe(
      'The ______ includes infection.',
    );
  });

  it('normalizes typed answers and records a learning fact separately from scheduling', async () => {
    const registry = new ActivityRegistry();
    for (const engine of createActivityEngines()) registry.register(engine.kind, engine);
    const repository = new InMemoryActivityAdapter();
    const events = new InMemoryLearningEventAdapter();
    const service = new ActivityPracticeService({
      registry,
      repository,
      events,
      createId: (() => {
        let id = 0;
        return () => `activity-${++id}`;
      })(),
      now: () => new Date('2026-09-07T10:00:05.000Z'),
    });

    const spec = await service.createSpec('typing', learningObject, occurrence);
    const result = await service.complete(
      spec,
      '  Differential   Diagnosis ',
      new Date('2026-09-07T10:00:00.000Z'),
    );

    expect(result).toMatchObject({ correct: true, score: 1, durationMs: 5_000 });
    expect(await repository.getSpec(spec.id)).toEqual(spec);
    expect(events.all().map((event) => event.type)).toEqual(['practice_completed']);
  });
});
