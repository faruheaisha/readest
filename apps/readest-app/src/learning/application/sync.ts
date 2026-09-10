import { LEARNING_SYNC_CONTRACT_VERSION } from '../domain';
import type {
  LearningSyncCategoryId,
  LearningSyncRecord,
  LearningSyncResult,
  LearningSyncStatus,
} from '../domain';
import type { SyncCategoryRegistry } from '../kernel';
import type { LearningSyncTransportPort, SyncPort } from '../ports';

export interface LearningSyncServiceDependencies {
  categories: SyncCategoryRegistry;
  transport: LearningSyncTransportPort;
  /**
   * Consent predicate evaluated at apply time, not only at dispatch. A pull
   * that is already in flight cannot be recalled, so the response must be
   * discarded rather than imported once consent is withdrawn. The composition
   * root wires this to the same category gate the transport uses.
   */
  canApply?: () => boolean;
}

/**
 * Coordinates domain-owned category adapters over a replaceable transport.
 * It never knows Readest replica kinds, HLCs, HTTP, or storage providers.
 */
export class LearningSyncService implements SyncPort {
  private currentStatus: LearningSyncStatus = 'idle';

  constructor(private readonly dependencies: LearningSyncServiceDependencies) {}

  private assertApplyAllowed(): void {
    if (this.dependencies.canApply && !this.dependencies.canApply()) {
      this.currentStatus = 'disabled';
      throw new Error('Learning sync is disabled');
    }
  }

  async sync(categories?: readonly LearningSyncCategoryId[]): Promise<LearningSyncResult> {
    this.currentStatus = 'syncing';
    try {
      const ordered = this.dependencies.categories.resolve(categories);
      const ids = ordered.map(({ descriptor }) => descriptor.id);
      const pushed = await this.publish(ids);
      const pulled = await this.pull(ids);
      this.currentStatus = 'idle';
      return { categories: ids, pushed, ...pulled };
    } catch (error) {
      this.currentStatus = 'error';
      throw error;
    }
  }

  async publish(categories?: readonly LearningSyncCategoryId[]): Promise<number> {
    this.assertApplyAllowed();
    const ordered = this.dependencies.categories.resolve(categories);
    const records = (await Promise.all(ordered.map((adapter) => adapter.collect()))).flat();
    this.assertRecordsBelongToAdapters(
      records,
      ordered.map(({ descriptor }) => descriptor.id),
    );
    await this.dependencies.transport.push(records);
    return records.length;
  }

  async pull(
    categories?: readonly LearningSyncCategoryId[],
  ): Promise<{ pulled: number; applied: number; ignored: number }> {
    this.assertApplyAllowed();
    const ordered = this.dependencies.categories.resolve(categories);
    const ids = ordered.map(({ descriptor }) => descriptor.id);
    const records = await this.dependencies.transport.pull(ids);
    // The request cannot be recalled once dispatched; re-check before any
    // record reaches local storage so a revoked response is discarded whole.
    this.assertApplyAllowed();
    this.assertRecordsBelongToAdapters(records, ids);

    let applied = 0;
    let ignored = 0;
    for (const adapter of ordered) {
      this.assertApplyAllowed();
      const categoryRecords = records.filter(({ category }) => category === adapter.descriptor.id);
      const result = await adapter.apply(categoryRecords);
      applied += result.applied;
      ignored += result.ignored;
    }
    return { pulled: records.length, applied, ignored };
  }

  async status(): Promise<LearningSyncStatus> {
    if (this.currentStatus !== 'idle') return this.currentStatus;
    return this.dependencies.transport.status();
  }

  private assertRecordsBelongToAdapters(
    records: readonly LearningSyncRecord[],
    allowedCategories: readonly LearningSyncCategoryId[],
  ): void {
    const allowed = new Set(allowedCategories);
    for (const record of records) {
      if (!allowed.has(record.category)) {
        throw new Error(`Sync transport returned unrequested category "${record.category}"`);
      }
      if (record.contractVersion !== LEARNING_SYNC_CONTRACT_VERSION) {
        throw new Error(
          `Sync record "${record.id}" uses unsupported contract ${record.contractVersion}`,
        );
      }
    }
  }
}
