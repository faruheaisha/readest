import type {
  LearningSyncCategoryId,
  LearningSyncRecord,
  LearningSyncStatus,
} from '../domain';
import type { LearningSyncTransportPort } from '../ports';

/**
 * Deterministic transport used by contract tests and offline/local workflows.
 * A shared instance can represent the same remote store for multiple devices.
 */
export class InMemoryLearningSyncTransport implements LearningSyncTransportPort {
  readonly #records = new Map<string, LearningSyncRecord>();
  private currentStatus: LearningSyncStatus = 'idle';

  async push(records: readonly LearningSyncRecord[]): Promise<void> {
    this.currentStatus = 'syncing';
    try {
      for (const record of records) {
        const key = `${record.category}\u0000${record.id}`;
        const existing = this.#records.get(key);
        if (!existing || existing.updatedAt < record.updatedAt) this.#records.set(key, record);
      }
    } finally {
      this.currentStatus = 'idle';
    }
  }

  async pull(categories: readonly LearningSyncCategoryId[]): Promise<readonly LearningSyncRecord[]> {
    this.currentStatus = 'syncing';
    try {
      const allowed = new Set(categories);
      return [...this.#records.values()]
        .filter(({ category }) => allowed.has(category))
        .sort((left, right) =>
          left.category === right.category
            ? left.id.localeCompare(right.id)
            : left.category.localeCompare(right.category),
        );
    } finally {
      this.currentStatus = 'idle';
    }
  }

  async status(): Promise<LearningSyncStatus> {
    return this.currentStatus;
  }
}
