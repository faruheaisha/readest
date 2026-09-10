import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadestReplicaSyncAdapter } from '@/learning/adapters/readest-sync';
import { publishReplicaUpsert } from '@/services/sync/replicaPublish';
import { ReplicaSyncManager } from '@/services/sync/replicaSyncManager';
import { HlcGenerator } from '@/libs/crdt';
import { createLearningReplicaAdapter } from '@/services/sync/adapters/learning';
import { registerReplicaAdapter, getReplicaAdapter } from '@/services/sync/replicaRegistry';
import { __resetReplicaSyncForTests } from '@/services/sync/replicaSync';
import { useSettingsStore } from '@/store/settingsStore';
import type { LearningSyncRecord } from '@/learning/domain';
import type { ReplicaSyncContext } from '@/services/sync/replicaSync';

vi.mock('@/utils/access', () => ({ getUserID: async () => 'user-a' }));
// The passphrase gate would block on a user prompt; the failure path under
// test is "no key is available", so the gate reports it cannot unlock.
vi.mock('@/services/sync/passphraseGate', () => ({
  ensurePassphraseUnlocked: async () => {},
}));

const initialSettings = useSettingsStore.getState().settings;
const setLearning = (enabled: boolean) =>
  useSettingsStore.setState({
    settings: { ...initialSettings, syncCategories: { learning: enabled } },
  });

beforeEach(() => {
  setLearning(true);
  if (!getReplicaAdapter('learning_lexicon')) {
    registerReplicaAdapter(createLearningReplicaAdapter('learning.lexicon'));
  }
});
afterEach(() => {
  __resetReplicaSyncForTests();
  useSettingsStore.setState({ settings: initialSettings });
});

const DEV = 'device-a';

const record: LearningSyncRecord = {
  id: 'learning.lexicon:hash',
  category: 'learning.lexicon',
  contractVersion: '1.0.0',
  updatedAt: '2026-09-10T00:00:00.000Z',
  payload: { privateText: 'secret' },
};

describe('learning payload encryption failures', () => {
  it('fails loudly instead of silently dropping a required-encryption payload', async () => {
    // Replica sync was never initialized (signed out / not bootstrapped). The
    // old behaviour was a silent no-op that reported success; a private,
    // required-encryption record must surface the failure instead.
    await expect(publishReplicaUpsert('learning_lexicon', record, record.id)).rejects.toThrow(
      'Replica sync is not initialized for replica kind "learning_lexicon"',
    );
  });

  it('keeps the silent no-op for optional categories without encryption requirements', async () => {
    // A non-required kind without an adapter stays a no-op — behaviour for
    // unrelated Readest categories must not change.
    await expect(
      publishReplicaUpsert('some_optional_kind', record, record.id),
    ).resolves.toBeUndefined();
  });

  it('fails loudly when a backend category is unsupported', async () => {
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () =>
        ({
          manager: { pullMany: async () => new Map(), flush: async () => {} },
        }) as unknown as ReplicaSyncContext,
      getUserId: async () => 'user-a',
    });

    await expect(adapter.pull(['learning.events'])).rejects.toThrow(
      'Readest backend does not support replica kind "learning_event"',
    );
  });

  it('fails loudly when a cipher payload cannot be decrypted', async () => {
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () =>
        ({
          manager: {
            flush: async () => {},
            // A live row whose payload is a cipher envelope that this device
            // cannot open (missing key) — decryption must fail explicitly.
            pullMany: async () =>
              new Map([
                [
                  'learning_lexicon',
                  [
                    {
                      user_id: 'user-a',
                      kind: 'learning_lexicon',
                      replica_id: record.id,
                      fields_jsonb: {
                        payload: {
                          v: {
                            c: 'ciphertext',
                            i: 'iv',
                            s: 'salt-id',
                            alg: 'A256GCM',
                            h: 'sha256',
                          },
                          t: '000018b8a1f0d000-00000000-device-a',
                          s: 'device-a',
                        },
                      },
                      manifest_jsonb: null,
                      deleted_at_ts: null,
                      reincarnation: null,
                      updated_at_ts: '000018b8a1f0d000-00000000-device-a',
                      schema_version: 1,
                    },
                  ],
                ],
              ]),
          },
        }) as unknown as ReplicaSyncContext,
      getUserId: async () => 'user-a',
    });

    await expect(adapter.pull(['learning.lexicon'])).rejects.toThrow(/decrypt/i);
  });

  it('does not report success when consent is withdrawn mid-batch', async () => {
    const manager = new ReplicaSyncManager({
      hlc: new HlcGenerator(DEV),
      client: { push: async (rows) => rows, pull: async () => [], pullBatch: async () => [] },
      cursorStore: { get: () => null, set: () => {} },
      canPushKind: () => false,
    });
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () => ({ manager }) as unknown as ReplicaSyncContext,
      getUserId: async () => 'user-a',
    });
    setLearning(false);
    await expect(adapter.push([record])).rejects.toThrow('Learning sync is disabled');
  });
});
