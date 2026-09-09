import {
  TELEMETRY_EVENT_CONTRACT_VERSION,
  type ActionDefinition,
  type LearningEvent,
  type SelectionContext,
  type TelemetryEvent,
} from '../domain';
import type { Awaitable, JobPort, PolicyPort, QuotaPort, TelemetryPort } from '../ports';
import { ActionRegistry, ContractSchemaRegistry } from './registry';

export type EventHandler = (event: LearningEvent) => Awaitable<void>;

export class EventRuntime {
  readonly #handlers = new Map<LearningEvent['type'], Set<EventHandler>>();

  subscribe(type: LearningEvent['type'], handler: EventHandler): () => void {
    const handlers = this.#handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.#handlers.set(type, handlers);
    return () => handlers.delete(handler);
  }

  async publish(event: LearningEvent): Promise<void> {
    await Promise.all([...(this.#handlers.get(event.type) ?? [])].map((handler) => handler(event)));
  }
}

export class ConfigRuntime {
  readonly #values = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this.#values.set(key, value);
  }

  get<T>(key: string, fallback: T): T {
    return (this.#values.get(key) as T | undefined) ?? fallback;
  }
}

export class TelemetryRuntime {
  constructor(private readonly telemetry: TelemetryPort) {}

  capture(event: TelemetryEvent): Promise<void> {
    return this.telemetry.capture(event);
  }
}

export class PolicyRuntime {
  constructor(
    private readonly policy: PolicyPort,
    private readonly quota: QuotaPort,
  ) {}

  async allow(
    subjectId: string | null,
    capability: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    if (!(await this.policy.authorize(subjectId, capability))) return false;
    if (subjectId === null) return true;
    return this.quota.consume(subjectId, capability, 1, idempotencyKey);
  }
}

export class JobRuntime {
  constructor(private readonly jobs: JobPort) {}

  enqueue<TPayload>(kind: string, payload: TPayload, idempotencyKey: string): Promise<string> {
    return this.jobs.enqueue(kind, payload, idempotencyKey);
  }
}

export interface ActionHandler<TResult> {
  execute(
    selection: SelectionContext,
    context: { action: ActionDefinition; locale: string },
  ): Promise<TResult>;
}

const betaActionType = (
  actionId: string,
): 'dictionary' | 'translation' | 'ai_explain' | 'grammar' | null => {
  if (actionId === 'dictionary.lookup') return 'dictionary';
  if (actionId === 'translation.translate') return 'translation';
  if (actionId === 'ai.explain') return 'ai_explain';
  if (actionId === 'ai.grammar') return 'grammar';
  return null;
};

const providerClass = (result: unknown): 'local' | 'byok' | 'platform' | 'external' | 'unknown' => {
  if (!result || typeof result !== 'object' || !('provider' in result)) return 'unknown';
  const provider = result.provider;
  if (!provider || typeof provider !== 'object' || !('id' in provider)) return 'unknown';
  const id = provider.id;
  if (typeof id !== 'string') return 'unknown';
  if (id === 'english-learning-os.platform-ai') return 'platform';
  if (id.includes('ollama')) return 'local';
  if (id.startsWith('readest.translation.')) return 'external';
  if (id.startsWith('readest.') && !id.startsWith('readest.dictionary')) return 'byok';
  return 'unknown';
};

export class ExecutionRuntime {
  readonly #handlers = new Map<string, ActionHandler<unknown>>();

  constructor(
    private readonly actions: ActionRegistry,
    private readonly schemas: ContractSchemaRegistry,
    private readonly policy?: PolicyRuntime,
    private readonly telemetry?: TelemetryRuntime,
  ) {}

  register<TResult>(actionId: string, handler: ActionHandler<TResult>): void {
    this.actions.require(actionId);
    if (this.#handlers.has(actionId)) {
      throw new Error(`ExecutionRuntime: handler for "${actionId}" is already registered`);
    }
    this.#handlers.set(actionId, handler);
  }

  async execute<TResult>(input: {
    actionId: string;
    selection: SelectionContext;
    subjectId: string | null;
    idempotencyKey: string;
    clientSessionId?: string;
    telemetryActorId?: string;
    locale?: string;
    outputSchema?: string;
  }): Promise<TResult> {
    const action = this.actions.require(input.actionId);
    if (
      this.policy &&
      !(await this.policy.allow(input.subjectId, action.capability, input.idempotencyKey))
    ) {
      throw new Error(`ExecutionRuntime: action "${input.actionId}" is not allowed`);
    }
    const handler = this.#handlers.get(input.actionId);
    if (!handler) throw new Error(`ExecutionRuntime: no handler for "${input.actionId}"`);
    const startedAt = Date.now();
    const result = await handler.execute(input.selection, {
      action,
      locale: input.locale ?? input.selection.language,
    });
    const output = input.outputSchema
      ? this.schemas.parse<TResult>(input.outputSchema, result)
      : (result as TResult);
    const actionType = betaActionType(input.actionId);
    if (this.telemetry && input.clientSessionId && actionType) {
      await this.telemetry.capture({
        id: `telemetry:context-action:${input.idempotencyKey}`,
        contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
        name: 'context_action_completed',
        occurredAt: new Date(),
        clientSessionId: input.clientSessionId,
        ...(input.telemetryActorId ? { actorId: input.telemetryActorId } : {}),
        properties: {
          actionType,
          latencyMs: Date.now() - startedAt,
          providerClass: providerClass(output),
        },
      });
    }
    return output;
  }
}
