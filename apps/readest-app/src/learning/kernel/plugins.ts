import type { PluginManifest } from '../contracts';
import { pluginManifestSchema } from '../contracts';
import { CapabilityRegistry, NamedRegistry } from './registry';

export type PluginState =
  | 'discovered'
  | 'declared'
  | 'validated'
  | 'registered'
  | 'loaded'
  | 'started'
  | 'healthy'
  | 'unhealthy'
  | 'failed'
  | 'disposed';

export interface PluginHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
}

export interface LearningPlugin {
  manifest: PluginManifest;
  load?(): Promise<void>;
  declare?(): Promise<PluginManifest | void>;
  register?(context: PluginRegistrationContext): Promise<void>;
  start?(): Promise<void>;
  health?(): Promise<PluginHealth>;
  dispose?(): Promise<void>;
}

export interface PluginRegistrationContext {
  capabilities: CapabilityRegistry;
}

export class PluginRegistry extends NamedRegistry<LearningPlugin> {
  constructor() {
    super('PluginRegistry');
  }
}

export class PluginLifecycle {
  readonly #states = new Map<string, PluginState>();
  readonly #active: string[] = [];

  constructor(
    private readonly plugins: PluginRegistry,
    private readonly capabilities: CapabilityRegistry,
  ) {
    for (const [id] of plugins.entries()) this.#states.set(id, 'discovered');
  }

  getState(pluginId: string): PluginState | undefined {
    return this.#states.get(pluginId);
  }

  async startAll(): Promise<void> {
    for (const [registeredId, plugin] of this.plugins.entries()) {
      try {
        await plugin.load?.();
        this.#states.set(registeredId, 'loaded');
        const declaration = (await plugin.declare?.()) ?? plugin.manifest;
        this.#states.set(registeredId, 'declared');
        const manifest = pluginManifestSchema.parse(declaration);
        this.#states.set(registeredId, 'validated');
        if (manifest.id !== registeredId) {
          throw new Error(
            `PluginRegistry key "${registeredId}" does not match manifest id "${manifest.id}"`,
          );
        }
        for (const capability of manifest.capabilities) {
          this.capabilities.register(capability, { owner: manifest.id });
        }
        this.#active.push(registeredId);
        await plugin.register?.({ capabilities: this.capabilities });
        this.#states.set(registeredId, 'registered');
        await plugin.start?.();
        this.#states.set(registeredId, 'started');
        const health = (await plugin.health?.()) ?? { status: 'healthy' as const };
        this.#states.set(registeredId, health.status === 'unhealthy' ? 'unhealthy' : 'healthy');
      } catch (error) {
        this.#states.set(registeredId, 'failed');
        await this.disposeAll();
        throw error;
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const pluginId of [...this.#active].reverse()) {
      const plugin = this.plugins.require(pluginId);
      await plugin.dispose?.();
      for (const capability of plugin.manifest.capabilities) {
        this.capabilities.remove(capability);
      }
      this.#states.set(pluginId, 'disposed');
    }
    this.#active.length = 0;
  }
}
