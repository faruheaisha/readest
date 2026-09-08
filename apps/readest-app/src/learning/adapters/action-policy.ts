import type { PolicyPort, QuotaPort } from '../ports';

export class CapabilityPolicyAdapter implements PolicyPort {
  readonly #capabilities: ReadonlySet<string>;

  constructor(capabilities: readonly string[]) {
    this.#capabilities = new Set(capabilities);
  }

  async authorize(_subjectId: string | null, capability: string): Promise<boolean> {
    return this.#capabilities.has(capability);
  }
}

/**
 * The client participates in the QuotaPort contract, while the provider's
 * authenticated server boundary remains the authoritative usage ledger.
 * BYOK and local providers deliberately do not consume platform allowance.
 */
export class ProviderEnforcedQuotaAdapter implements QuotaPort {
  async consume(
    _subjectId: string,
    _capability: string,
    _quantity: number,
    _idempotencyKey: string,
  ): Promise<boolean> {
    return true;
  }
}
