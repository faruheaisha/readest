import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReadestReplicaSyncAdapter } from '@/learning/adapters/readest-sync';
import { createLearningReplicaAdapter } from '@/services/sync/adapters/learning';
import { registerReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { LearningSyncRecord } from '@/learning/domain';
import type { ReplicaSyncContext } from '@/services/sync/replicaSync';
import { useSettingsStore } from '@/store/settingsStore';

const initialSettings = useSettingsStore.getState().settings;
beforeEach(() =>
  useSettingsStore.setState({
    settings: { ...initialSettings, syncCategories: { learning: true } },
  }),
);
afterEach(() => useSettingsStore.setState({ settings: initialSettings }));

const record: LearningSyncRecord = {
  id: 'learning.lexicon:hash',
  category: 'learning.lexicon',
  contractVersion: '1.0.0',
  updatedAt: '2026-09-10T00:00:00.000Z',
  payload: { privateText: 'account-scoped' },
};

interface MutableAccount {
  id: string | null;
}

const contextWith = (overrides: Record<string, unknown>): ReplicaSyncContext =>
  ({
    manager: { flush: async () => {}, pullMany: async () => new Map(), ...overrides },
  }) as unknown as ReplicaSyncContext;

describe('learning sync account isolation', () => {
  it('reports disabled and refuses to push or pull after sign-out', async () => {
    const account: MutableAccount = { id: null };
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () => contextWith({}),
      getUserId: async () => account.id,
    });

    await expect(adapter.push([record])).rejects.toThrow(
      'Readest replica sync requires an authenticated account',
    );
    await expect(adapter.pull(['learning.lexicon'])).rejects.toThrow(
      'Readest replica sync requires an authenticated account',
    );
    expect(await adapter.status()).toBe('disabled');
  });

  it('drops a response that resolves after the active account changed', async () => {
    const account: MutableAccount = { id: 'account-a' };
    // Switch accounts *inside* the held-open pull, mirroring a sign-out or a
    // fast account switch while the network request is still in flight.
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () =>
        contextWith({
          pullMany: async () => {
            account.id = 'account-b';
            return new Map([['learning_lexicon', []]]);
          },
        }),
      getUserId: async () => account.id,
    });

    await expect(adapter.pull(['learning.lexicon'])).rejects.toThrow(
      'Learning sync account changed',
    );
    expect(await adapter.status()).toBe('disabled');
  });

  it('drops a response when the account signs out during decryption', async () => {
    // A row without a cipher payload skips the decrypt hook, so drive the
    // switch through the row loop's own re-check instead.
    const account: MutableAccount = { id: 'account-a' };
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () =>
        contextWith({
          pullMany: async () => {
            account.id = null;
            return new Map([['learning_lexicon', []]]);
          },
        }),
      getUserId: async () => account.id,
    });

    await expect(adapter.pull(['learning.lexicon'])).rejects.toThrow(
      'Learning sync account changed',
    );
    expect(await adapter.status()).toBe('disabled');
  });

  it('does not publish queued account-A writes after the account switched', async () => {
    registerReplicaAdapterIfMissing();
    // First lookups (consent + context + subject capture) see account A; by
    // the time the push loop re-checks, the session has moved to account B.
    let calls = 0;
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () => contextWith({}),
      getUserId: async () => (++calls <= 2 ? 'account-a' : 'account-b'),
    });

    await expect(adapter.push([record])).rejects.toThrow('Learning sync account changed');
    expect(await adapter.status()).toBe('disabled');
  });

  it('reports idle and serves the signed-in account again', async () => {
    const account: MutableAccount = { id: 'account-b' };
    const adapter = new ReadestReplicaSyncAdapter({
      getContext: () => contextWith({ pullMany: async () => new Map([['learning_lexicon', []]]) }),
      getUserId: async () => account.id,
    });

    await expect(adapter.pull(['learning.lexicon'])).resolves.toEqual([]);
    expect(await adapter.status()).toBe('idle');
  });
});

const registerReplicaAdapterIfMissing = (): void => {
  try {
    registerReplicaAdapter(createLearningReplicaAdapter('learning.lexicon'));
  } catch {
    // The transport constructor already registered it — fine.
  }
};
