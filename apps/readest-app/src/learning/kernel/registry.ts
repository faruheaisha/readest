import type { ZodType } from 'zod';
import type { ActionDefinition, ActivityKind, ProviderMetadata } from '../domain';
import type { ActivityEnginePort } from '../ports';

export interface CapabilityRegistration {
  owner: string;
  metadata?: Readonly<Record<string, string>>;
}

export class NamedRegistry<T> {
  readonly #values = new Map<string, T>();

  constructor(private readonly registryName: string) {}

  register(id: string, value: T): void {
    if (this.#values.has(id)) {
      throw new Error(`${this.registryName}: "${id}" is already registered`);
    }
    this.#values.set(id, value);
  }

  get(id: string): T | undefined {
    return this.#values.get(id);
  }

  require(id: string): T {
    const value = this.#values.get(id);
    if (value === undefined) throw new Error(`${this.registryName}: "${id}" is not registered`);
    return value;
  }

  has(id: string): boolean {
    return this.#values.has(id);
  }

  remove(id: string): boolean {
    return this.#values.delete(id);
  }

  entries(): readonly (readonly [string, T])[] {
    return [...this.#values.entries()];
  }

  values(): readonly T[] {
    return [...this.#values.values()];
  }

  clear(): void {
    this.#values.clear();
  }
}

export class ServiceRegistry extends NamedRegistry<unknown> {
  constructor() {
    super('ServiceRegistry');
  }
}

export class CapabilityRegistry extends NamedRegistry<CapabilityRegistration> {
  constructor() {
    super('CapabilityRegistry');
  }
}

export class ProviderRegistry extends NamedRegistry<ProviderMetadata> {
  constructor() {
    super('ProviderRegistry');
  }
}

export class ActionRegistry extends NamedRegistry<ActionDefinition> {
  constructor() {
    super('ActionRegistry');
  }
}

export class ActivityRegistry extends NamedRegistry<ActivityEnginePort> {
  constructor() {
    super('ActivityRegistry');
  }

  registerEngine(engine: ActivityEnginePort): void {
    this.register(engine.kind, engine);
  }

  requireKind(kind: ActivityKind): ActivityEnginePort {
    return this.require(kind);
  }
}

export class ContractSchemaRegistry extends NamedRegistry<ZodType> {
  constructor() {
    super('ContractSchemaRegistry');
  }

  parse<T>(id: string, value: unknown): T {
    return this.require(id).parse(value) as T;
  }
}
