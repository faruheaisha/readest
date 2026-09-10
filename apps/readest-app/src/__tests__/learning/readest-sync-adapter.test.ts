import { describe, expect, it, vi } from 'vitest';
import { ReadestReplicaSyncAdapter } from '@/learning/adapters/readest-sync';
import { createLearningReplicaAdapter } from '@/services/sync/adapters/learning';
import { LEARNING_REPLICA_KINDS } from '@/services/sync/learningReplicaKinds';
import { validateRow } from '@/libs/replicaSchemas';
import type { LearningSyncRecord } from '@/learning/domain';
import type { ReplicaSyncContext } from '@/services/sync/replicaSync';
import type { Hlc, ReplicaRow } from '@/types/replica';

vi.mock('@/utils/access', () => ({ getUserID: async () => null }));

const HLC = '00001991f7f8c00-00000000-device-a' as Hlc;

const record: LearningSyncRecord = {
  id: 'learning.lexicon:hash',
  category: 'learning.lexicon',
  contractVersion: '1.0.0',
  updatedAt: '2026-09-09T12:00:00.000Z',
  payload: { privateText: 'never plaintext on the replica wire' },
};

const row = (value: unknown): ReplicaRow => ({
  user_id: 'user-a',
  kind: LEARNING_REPLICA_KINDS['learning.lexicon'],
  replica_id: record.id,
  fields_jsonb: { payload: { v: value, t: HLC, s: 'device-a' } },
  manifest_jsonb: null,
  deleted_at_ts: null,
  reincarnation: null,
  updated_at_ts: HLC,
  schema_version: 1,
});

describe('Readest learning replica adapter', () => {
  it('maps domain categories centrally and requires payload encryption', () => {
    const adapter = createLearningReplicaAdapter('learning.lexicon');
    expect(adapter.kind).toBe('learning_lexicon');
    expect(adapter.encryptionPolicy).toBe('required');
    expect(adapter.encryptedFields).toEqual(['payload']);
    expect(adapter.pack(record)).toEqual({ payload: JSON.stringify(record) });
  });

  it('rejects plaintext learning payloads at the server schema boundary', () => {
    const validation = validateRow(row(JSON.stringify(record)));
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.code).toBe('VALIDATION');
  });

  it('accepts only a cipher envelope for a learning payload', () => {
    const validation = validateRow(
      row({ c: 'ciphertext', i: 'iv', s: 'salt-id', alg: 'A256GCM', h: 'sha256' }),
    );
    expect(validation.ok).toBe(true);
  });

  it('refuses to pack a record from another category', () => {
    const adapter = createLearningReplicaAdapter('learning.memory');
    expect(() => adapter.pack(record)).toThrow(
      'Replica kind for learning.memory cannot pack learning.lexicon',
    );
  });

  it('does not treat an unsupported backend kind as an empty successful pull', async () => {
    const context = {
      manager: { pullMany: async () => new Map() },
    } as unknown as ReplicaSyncContext;
    const transport = new ReadestReplicaSyncAdapter({
      getContext: () => context,
      getUserId: async () => 'user-a',
    });

    await expect(transport.pull(['learning.lexicon'])).rejects.toThrow(
      'Readest backend does not support replica kind "learning_lexicon"',
    );
    expect(await transport.status()).toBe('error');
  });

  it('reports sync disabled without an authenticated account', async () => {
    const context = {} as ReplicaSyncContext;
    const transport = new ReadestReplicaSyncAdapter({
      getContext: () => context,
      getUserId: async () => null,
    });

    expect(await transport.status()).toBe('disabled');
  });
});
