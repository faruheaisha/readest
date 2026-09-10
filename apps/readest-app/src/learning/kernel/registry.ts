import type { ZodType } from 'zod';
import type {
  ActionDefinition,
  ActivityKind,
  LearningSyncCategoryId,
  ProviderMetadata,
} from '../domain';
import type { ActivityEnginePort, LearningSyncCategoryPort } from '../ports';

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

export class ProviderRouter<TProvider extends { isAvailable(): Promise<boolean> }> {
  readonly #routes = new Map<string, TProvider[]>();

  register(capability: string, provider: TProvider): void {
    const providers = this.#routes.get(capability) ?? [];
    if (providers.includes(provider)) {
      throw new Error(`ProviderRouter: provider is already registered for "${capability}"`);
    }
    providers.push(provider);
    this.#routes.set(capability, providers);
  }

  async resolve(capability: string): Promise<TProvider> {
    const providers = this.#routes.get(capability) ?? [];
    for (const provider of providers) {
      if (await provider.isAvailable()) return provider;
    }
    throw new Error(`ProviderRouter: no available provider for "${capability}"`);
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

export class SyncCategoryRegistry extends NamedRegistry<LearningSyncCategoryPort> {
  constructor() {
    super('SyncCategoryRegistry');
  }

  registerCategory(adapter: LearningSyncCategoryPort): void {
    if (adapter.descriptor.dependencies.includes(adapter.descriptor.id)) {
      throw new Error(`Sync category "${adapter.descriptor.id}" cannot depend on itself`);
    }
    this.register(adapter.descriptor.id, adapter);
  }

  resolve(requested?: readonly LearningSyncCategoryId[]): readonly LearningSyncCategoryPort[] {
    const ids = requested ?? this.values().map(({ descriptor }) => descriptor.id);
    const ordered: LearningSyncCategoryPort[] = [];
    const visiting = new Set<LearningSyncCategoryId>();
    const visited = new Set<LearningSyncCategoryId>();

    const visit = (id: LearningSyncCategoryId): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Sync category dependency cycle includes "${id}"`);
      visiting.add(id);
      const adapter = this.require(id);
      for (const dependency of adapter.descriptor.dependencies) visit(dependency);
      visiting.delete(id);
      visited.add(id);
      ordered.push(adapter);
    };

    for (const id of ids) visit(id);
    return ordered;
  }
}
