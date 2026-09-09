import { TELEMETRY_EVENT_CONTRACT_VERSION } from '../domain';
import type { TelemetryEvent } from '../domain';
import type { TelemetryPort } from '../ports';

export type ContentImportMethod = 'local_file' | 'url' | 'clip' | 'catalog' | 'unknown';
export type ContentOpenSource = 'library' | 'today' | 'review' | 'import' | 'search' | 'unknown';
export type ImportFailureClass =
  | 'unsupported'
  | 'parse_error'
  | 'network'
  | 'server_resource'
  | 'timeout'
  | 'storage'
  | 'user_cancel'
  | 'unknown';
export type LatencyBucket = 'fast' | 'acceptable' | 'slow' | 'failed' | 'unknown';

export interface ContentImportEvidence {
  id: string;
  startedAt: Date;
  contentType: string;
}

interface BetaEvidenceDependencies {
  telemetry: TelemetryPort;
  context: () => { clientSessionId: string; actorId?: string };
  now?: () => Date;
  createId?: () => string;
}

const createRandomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const classifyContentType = (name?: string): string => {
  const clean = name?.split(/[?#]/u)[0]?.trim() ?? '';
  const extension = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() : undefined;
  if (!extension) return 'unknown';
  return extension === 'markdown' ? 'md' : extension.slice(0, 80);
};

export const classifySize = (bytes?: number): 'tiny' | 'small' | 'medium' | 'large' | 'unknown' => {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024 * 1024) return 'tiny';
  if (bytes < 10 * 1024 * 1024) return 'small';
  if (bytes < 50 * 1024 * 1024) return 'medium';
  return 'large';
};

export const classifyLatency = (
  milliseconds?: number | null,
  thresholds: { fast: number; acceptable: number } = { fast: 300, acceptable: 1_000 },
): LatencyBucket => {
  if (milliseconds === null) return 'failed';
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return 'unknown';
  }
  if (milliseconds < thresholds.fast) return 'fast';
  if (milliseconds < thresholds.acceptable) return 'acceptable';
  return 'slow';
};

export class BetaEvidenceService {
  readonly #telemetry: TelemetryPort;
  readonly #context: () => { clientSessionId: string; actorId?: string };
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #openedInstances = new Set<string>();
  #networkSampled = false;

  constructor(dependencies: BetaEvidenceDependencies) {
    this.#telemetry = dependencies.telemetry;
    this.#context = dependencies.context;
    this.#now = dependencies.now ?? (() => new Date());
    this.#createId = dependencies.createId ?? createRandomId;
  }

  startContentImport(input: {
    name?: string;
    sizeBytes?: number;
    method: ContentImportMethod;
  }): ContentImportEvidence {
    const startedAt = this.#now();
    const evidence = {
      id: this.#createId(),
      startedAt,
      contentType: classifyContentType(input.name),
    };
    void this.#record({
      id: `telemetry:content-import-started:${evidence.id}`,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'content_import_started',
      occurredAt: startedAt,
      ...this.#context(),
      properties: {
        contentType: evidence.contentType,
        sizeBucket: classifySize(input.sizeBytes),
        method: input.method,
      },
    });
    return evidence;
  }

  completeContentImport(evidence: ContentImportEvidence, contentId: string): Promise<void> {
    const completedAt = this.#now();
    return this.#record({
      id: `telemetry:content-import-completed:${evidence.id}`,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'content_import_completed',
      occurredAt: completedAt,
      ...this.#context(),
      properties: {
        contentId,
        contentType: evidence.contentType,
        durationMs: Math.max(0, completedAt.getTime() - evidence.startedAt.getTime()),
      },
    });
  }

  failContentImport(
    evidence: ContentImportEvidence,
    failureClass: ImportFailureClass,
    stage: string,
  ): Promise<void> {
    return this.#record({
      id: `telemetry:content-import-failed:${evidence.id}`,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'content_import_failed',
      occurredAt: this.#now(),
      ...this.#context(),
      properties: { failureClass, stage },
    });
  }

  recordContentOpened(
    contentId: string,
    source: ContentOpenSource,
    openInstanceId: string,
  ): Promise<void> {
    if (this.#openedInstances.has(openInstanceId)) return Promise.resolve();
    this.#openedInstances.add(openInstanceId);
    const context = this.#context();
    return this.#record({
      id: `telemetry:content-opened:${context.clientSessionId}:${openInstanceId}`,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'content_opened',
      occurredAt: this.#now(),
      ...context,
      properties: { contentId, source },
    });
  }

  recordNetworkSample(input: {
    ttfbMs?: number | null;
    apiLatencyMs?: number | null;
  }): Promise<void> {
    if (this.#networkSampled) return Promise.resolve();
    this.#networkSampled = true;
    const context = this.#context();
    return this.#record({
      id: `telemetry:network-sample:${context.clientSessionId}`,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'network_sample',
      occurredAt: this.#now(),
      ...context,
      properties: {
        ttfbBucket: classifyLatency(input.ttfbMs, { fast: 300, acceptable: 800 }),
        apiLatencyBucket: classifyLatency(input.apiLatencyMs, {
          fast: 500,
          acceptable: 1_500,
        }),
      },
    });
  }

  async #record(event: TelemetryEvent): Promise<void> {
    try {
      await this.#telemetry.capture(event);
    } catch {
      console.warn('Beta evidence delivery failed');
    }
  }
}
