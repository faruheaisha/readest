import { describe, expect, it } from 'vitest';
import { BetaEvidenceService, classifyContentType, classifySize } from '@/learning/application';
import type { TelemetryEvent } from '@/learning/domain';

describe('BetaEvidenceService', () => {
  it('records an import lifecycle without retaining a filename', async () => {
    const events: TelemetryEvent[] = [];
    const times = [new Date('2026-09-09T12:00:00.000Z'), new Date('2026-09-09T12:00:01.250Z')];
    const evidence = new BetaEvidenceService({
      telemetry: { capture: async (event) => void events.push(event) },
      context: () => ({ clientSessionId: 'session-1', actorId: 'guest-1' }),
      now: () => times.shift()!,
      createId: () => 'import-1',
    });

    const attempt = evidence.startContentImport({
      name: 'private-medical-paper.PDF',
      sizeBytes: 2 * 1024 * 1024,
      method: 'local_file',
    });
    await evidence.completeContentImport(attempt, 'book-hash-1');

    expect(events).toEqual([
      expect.objectContaining({
        id: 'telemetry:content-import-started:import-1',
        name: 'content_import_started',
        properties: { contentType: 'pdf', sizeBucket: 'small', method: 'local_file' },
      }),
      expect.objectContaining({
        id: 'telemetry:content-import-completed:import-1',
        name: 'content_import_completed',
        properties: { contentId: 'book-hash-1', contentType: 'pdf', durationMs: 1250 },
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('private-medical-paper');
  });

  it('deduplicates one mounted reader instance but records later opens', async () => {
    const events: TelemetryEvent[] = [];
    const evidence = new BetaEvidenceService({
      telemetry: { capture: async (event) => void events.push(event) },
      context: () => ({ clientSessionId: 'session-1', actorId: 'guest-1' }),
      now: () => new Date('2026-09-09T12:00:00.000Z'),
    });

    await evidence.recordContentOpened('book-1', 'unknown', 'book-1-view-1');
    await evidence.recordContentOpened('book-1', 'unknown', 'book-1-view-1');
    await evidence.recordContentOpened('book-1', 'library', 'book-1-view-2');

    expect(events.map((event) => event.name)).toEqual(['content_opened', 'content_opened']);
    expect(events.map((event) => event.properties['source'])).toEqual(['unknown', 'library']);
  });
});

describe('beta evidence buckets', () => {
  it('normalizes only safe content classifications', () => {
    expect(classifyContentType('chapter.Markdown?download=1')).toBe('md');
    expect(classifyContentType('README')).toBe('unknown');
    expect(classifySize(undefined)).toBe('unknown');
    expect(classifySize(1024 * 1024)).toBe('small');
    expect(classifySize(50 * 1024 * 1024)).toBe('large');
  });
});
