import { isReplicaRowAlive } from '@/libs/replicaInterpret';
import {
  decryptRowFields,
  firstCipherEnvelope,
} from '@/services/sync/replicaCryptoMiddleware';
import { ensurePassphraseUnlocked } from '@/services/sync/passphraseGate';
import { publishReplicaUpsert } from '@/services/sync/replicaPublish';
import { getReplicaSync } from '@/services/sync/replicaSync';
import { getReplicaAdapter, registerReplicaAdapter } from '@/services/sync/replicaRegistry';
import { learningReplicaAdapters } from '@/services/sync/adapters/learning';
import { LEARNING_REPLICA_KINDS } from '@/services/sync/learningReplicaKinds';
import { isSyncCategoryEnabled } from '@/services/sync/syncCategories';
import type { ReplicaSyncContext } from '@/services/sync/replicaSync';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaRow } from '@/types/replica';
import type {
  LearningSyncCategoryId,
  LearningSyncRecord,
  LearningSyncStatus,
} from '../domain';
import type { LearningSyncTransportPort } from '../ports';

export interface ReadestReplicaSyncAdapterOptions {
  getContext?: () => ReplicaSyncContext | null;
  getUserId?: () => Promise<string | null>;
}

const getReadestUserId = async (): Promise<string | null> => {
  // Identity is a provider boundary. Keep it lazy so importing the learning
  // runtime for guest/offline use does not initialize Supabase configuration.
  const { getUserID } = await import('@/utils/access');
  return getUserID();
};

/**
 * Transport adapter only: HLCs, replica kinds, encryption, and cursor handling
 * stop outside the learning domain and reuse Readest's existing sync engine.
 */
export class ReadestReplicaSyncAdapter implements LearningSyncTransportPort {
  private readonly getContext: () => ReplicaSyncContext | null;
  private readonly getUserId: () => Promise<string | null>;
  private currentStatus: LearningSyncStatus = 'idle';

  constructor(options: ReadestReplicaSyncAdapterOptions = {}) {
    this.getContext = options.getContext ?? getReplicaSync;
    this.getUserId = options.getUserId ?? getReadestUserId;
    for (const adapter of learningReplicaAdapters) {
      if (!getReplicaAdapter(adapter.kind)) registerReplicaAdapter(adapter);
    }
  }

  async push(records: readonly LearningSyncRecord[]): Promise<void> {
    const context = await this.requireAuthenticatedContext();
    this.currentStatus = 'syncing';
    try {
      for (const record of records) {
        this.requireEnabled();
        await publishReplicaUpsert(
          LEARNING_REPLICA_KINDS[record.category],
          record,
          record.id,
        );
      }
      await context.manager.flush();
      this.currentStatus = 'idle';
    } catch (error) {
      this.currentStatus = 'error';
      throw error;
    }
  }

  async pull(
    categories: readonly LearningSyncCategoryId[],
  ): Promise<readonly LearningSyncRecord[]> {
    const context = await this.requireAuthenticatedContext();
    this.currentStatus = 'syncing';
    try {
      const kinds = categories.map((category) => LEARNING_REPLICA_KINDS[category]);
      // Full pull is intentional for explicit learning sync. Category apply is
      // idempotent, and this recovers from cursor-advanced/apply-failed gaps.
      const rowsByKind = await context.manager.pullMany(kinds, { since: null });
      this.requireEnabled();
      const records: LearningSyncRecord[] = [];
      for (const category of categories) {
        const kind = LEARNING_REPLICA_KINDS[category];
        const adapter = getReplicaAdapter<LearningSyncRecord>(kind);
        if (!adapter) throw new Error(`Missing Readest replica adapter for "${kind}"`);
        const sourceRows = rowsByKind.get(kind);
        if (!sourceRows) {
          throw new Error(`Readest backend does not support replica kind "${kind}"`);
        }
        for (const sourceRow of sourceRows) {
          if (!isReplicaRowAlive(sourceRow)) continue;
          const row = structuredClone(sourceRow);
          await this.decryptRequiredPayload(row, adapter);
          this.requireEnabled();
          const record = adapter.unpackRow(row, '');
          if (!record) {
            throw new Error(`Encrypted learning payload is unavailable for "${kind}"`);
          }
          if (record.category !== category) {
            throw new Error(`Replica kind "${kind}" returned category "${record.category}"`);
          }
          records.push(record);
        }
      }
      this.currentStatus = 'idle';
      return records;
    } catch (error) {
      this.currentStatus = 'error';
      throw error;
    }
  }

  async status(): Promise<LearningSyncStatus> {
    if (!isSyncCategoryEnabled('learning')) return 'disabled';
    if (!this.getContext() || !(await this.getUserId())) return 'disabled';
    return this.currentStatus;
  }

  private requireContext(): ReplicaSyncContext {
    const context = this.getContext();
    if (!context) {
      this.currentStatus = 'disabled';
      throw new Error('Readest replica sync is not initialized');
    }
    return context;
  }

  private requireEnabled(): void {
    if (!isSyncCategoryEnabled('learning')) {
      this.currentStatus = 'disabled';
      throw new Error('Learning sync is disabled');
    }
  }

  private async requireAuthenticatedContext(): Promise<ReplicaSyncContext> {
    this.requireEnabled();
    const context = this.requireContext();
    if (!(await this.getUserId())) {
      this.currentStatus = 'disabled';
      throw new Error('Readest replica sync requires an authenticated account');
    }
    this.requireEnabled();
    return context;
  }

  private async decryptRequiredPayload(
    row: ReplicaRow,
    adapter: ReplicaAdapter<LearningSyncRecord>,
  ): Promise<void> {
    const sample = firstCipherEnvelope(row.fields_jsonb, adapter.encryptedFields);
    await decryptRowFields(row.fields_jsonb, adapter.encryptedFields, undefined, {
      onLocked: (verifyWith) => ensurePassphraseUnlocked({ verifyWith, auto: true }),
      onWrongPassphrase: (verifyWith) =>
        ensurePassphraseUnlocked({ verifyWith, invalidate: true, auto: true }),
    });
    if (sample && !row.fields_jsonb['payload']) {
      throw new Error('Encrypted learning payload could not be decrypted');
    }
  }
}
