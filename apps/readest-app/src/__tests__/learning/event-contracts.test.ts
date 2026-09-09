import { describe, expect, it, vi } from 'vitest';
import { betaTelemetryEventSchema, learningEventSchema } from '@/learning/contracts';
import {
  LEARNING_EVENT_CONTRACT_VERSION,
  TELEMETRY_EVENT_CONTRACT_VERSION,
} from '@/learning/domain';
import { ReadestTelemetryAdapter } from '@/learning/adapters';

const envelope = {
  id: 'event-1',
  occurredAt: new Date('2026-09-09T12:00:00.000Z'),
  clientSessionId: 'session-1',
  actorId: 'guest-1',
} as const;

describe('learning event contracts', () => {
  it('accepts the versioned, privacy-minimized learning fact', () => {
    expect(
      learningEventSchema.parse({
        ...envelope,
        contractVersion: LEARNING_EVENT_CONTRACT_VERSION,
        type: 'learning_object_saved',
        aggregateId: 'object-1',
        properties: {
          objectType: 'sense',
          saveMode: 'save_and_practice',
          contentId: 'content-1',
          memorySubjectId: 'object-1',
        },
      }),
    ).toMatchObject({
      contractVersion: '1.0.0',
      type: 'learning_object_saved',
    });
  });

  it('rejects private text and unversioned event shapes', () => {
    expect(() =>
      learningEventSchema.parse({
        ...envelope,
        type: 'learning_object_saved',
        aggregateId: 'object-1',
        properties: {
          objectType: 'word',
          saveMode: 'save',
          contentId: 'content-1',
          memorySubjectId: 'object-1',
          selectedText: 'private sentence',
        },
      }),
    ).toThrow();
  });
});

describe('beta telemetry privacy contract', () => {
  it('rejects selected text even when the event name is valid', () => {
    expect(() =>
      betaTelemetryEventSchema.parse({
        ...envelope,
        contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
        name: 'context_action_completed',
        properties: {
          actionType: 'dictionary',
          latencyMs: 25,
          providerClass: 'local',
          selectedText: 'must not leave the device',
        },
      }),
    ).toThrow();
  });

  it('sends only a schema-approved flattened event envelope', async () => {
    const send = vi.fn();
    const adapter = new ReadestTelemetryAdapter(send);
    await adapter.capture({
      ...envelope,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'activity_completed',
      properties: {
        activityType: 'cloze',
        resultBucket: 'correct',
        attemptId: 'attempt-1',
        memorySubjectId: 'object-1',
      },
    });

    expect(send).toHaveBeenCalledWith('activity_completed', {
      event_id: 'event-1',
      contract_version: '1.0.0',
      occurred_at: '2026-09-09T12:00:00.000Z',
      client_session_id: 'session-1',
      actor_id: 'guest-1',
      activityType: 'cloze',
      resultBucket: 'correct',
      attemptId: 'attempt-1',
      memorySubjectId: 'object-1',
    });
  });

  it('fails closed before analytics receives an event outside the privacy contract', async () => {
    const send = vi.fn();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = new ReadestTelemetryAdapter(send);

    await adapter.capture({
      ...envelope,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'context_action_completed',
      properties: {
        actionType: 'dictionary',
        latencyMs: 25,
        providerClass: 'local',
        selectedText: 'must not leave the device',
      },
    });

    expect(send).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      'Learning telemetry event was rejected by its privacy contract',
    );
    warning.mockRestore();
  });
});
