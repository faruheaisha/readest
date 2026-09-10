import { isReplicaRowAlive } from '@/libs/replicaInterpret';
import { decryptRowFields, firstCipherEnvelope } from '@/services/sync/replicaCryptoMiddleware';
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
import type { LearningSyncCategoryId, LearningSyncRecord, LearningSyncStatus } from '../domain';
import type { LearningSyncTransportPort } from '../ports';

export interface ReadestReplicaSyncAdapterOptions {
  getContext?: () => ReplicaSyncContext | null;
  getUserId?: () => Promise<string | null>;
  /** Consent gate. Defaults to the shared Learning data category toggle. */
  canSync?: () => boolean;
}

const getReadestUserId = async (): Promise<string | null> => {
  // Identity is a provider boundary. Keep it lazy so importing the learning
  // runtime for guest/offline use does not initialize Supabase configuration.
  const { getUserID } = await import('@/utils/access');
  return getUserID();
};

const ACCOUNT_CHANGED = 'Learning sync account changed';

/**
 * Transport adapter only: HLCs, replica kinds, encryption, and cursor handling
 * stop outside the learning domain and reuse Readest's existing sync engine.
 *
 * Account scope: every push/pull is bound to the account that authorized it.
 * A sign-out, or a switch to a different account, must not let the previous
 * account's in-flight response, queued writes, cursor, or decryption session
 * be applied on top of the new one. Each operation captures the subject id
 * when it starts and re-verifies it before any local or remote effect; a
 * mismatch aborts instead of importing or flushing foreign data.
 */
export class ReadestReplicaSyncAdapter implements LearningSyncTransportPort {
  private readonly getContext: () => ReplicaSyncContext | null;
  private readonly getUserId: () => Promise<string | null>;
  private readonly canSync: () => boolean;
  private currentStatus: LearningSyncStatus = 'idle';

  constructor(options: ReadestReplicaSyncAdapterOptions = {}) {
    this.getContext = options.getContext ?? getReplicaSync;
    this.getUserId = options.getUserId ?? getReadestUserId;
    this.canSync = options.canSync ?? (() => isSyncCategoryEnabled('learning'));
    for (const adapter of learningReplicaAdapters) {
      if (!getReplicaAdapter(adapter.kind)) registerReplicaAdapter(adapter);
    }
  }

  async push(records: readonly LearningSyncRecord[]): Promise<void> {
    const context = await this.requireAuthenticatedContext();
    const subject = await this.requireSubject();
    this.currentStatus = 'syncing';
    try {
      for (const record of records) {
        await this.requireSameSubject(subject);
        await publishReplicaUpsert(LEARNING_REPLICA_KINDS[record.category], record, record.id);
      }
      await this.requireSameSubject(subject);
      await context.manager.flush();
      this.currentStatus = 'idle';
    } catch (error) {
      // A revoked/foreign account is "disabled", not a transport error; keep
      // that status so callers and the UI do not report a failure reason that
      // would invite a retry with the wrong account.
      if (error instanceof Error && error.message === ACCOUNT_CHANGED) throw error;
      this.currentStatus = 'error';
      throw error;
    }
  }

  async pull(
    categories: readonly LearningSyncCategoryId[],
  ): Promise<readonly LearningSyncRecord[]> {
    const context = await this.requireAuthenticatedContext();
    const subject = await this.requireSubject();
    this.currentStatus = 'syncing';
    try {
      const kinds = categories.map((category) => LEARNING_REPLICA_KINDS[category]);
      // Full pull is intentional for explicit learning sync. Category apply is
      // idempotent, and this recovers from cursor-advanced/apply-failed gaps.
      const rowsByKind = await context.manager.pullMany(kinds, { since: null });
      await this.requireSameSubject(subject);
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
          // Decryption is the only await before the record becomes applicable;
          // a sign-out during it must discard this response, not import it.
          await this.decryptRequiredPayload(row, adapter);
          await this.requireSameSubject(subject);
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
      if (error instanceof Error && error.message === ACCOUNT_CHANGED) throw error;
      this.currentStatus = 'error';
      throw error;
    }
  }

  async status(): Promise<LearningSyncStatus> {
    if (!this.canSync()) return 'disabled';
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
    if (!this.canSync()) {
      this.currentStatus = 'disabled';
      throw new Error('Learning sync is disabled');
    }
  }

  /** The account that authorized this operation; null means signed out. */
  private async requireSubject(): Promise<string | null> {
    return this.getUserId();
  }

  /**
   * Abort an operation whose authorizing account is no longer the active one.
   * Also covers explicit revocation of the Learning data category mid-flight.
   */
  private async requireSameSubject(subject: string | null): Promise<void> {
    this.requireEnabled();
    if ((await this.getUserId()) === subject) return;
    this.currentStatus = 'disabled';
    throw new Error(ACCOUNT_CHANGED);
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
