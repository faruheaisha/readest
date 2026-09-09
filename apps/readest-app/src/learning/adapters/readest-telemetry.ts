import { captureEvent } from '@/utils/telemetry';
import { betaTelemetryEventSchema } from '../contracts';
import type { TelemetryEvent } from '../domain';
import type { TelemetryPort } from '../ports';

type CaptureEvent = (name: string, properties?: Record<string, unknown>) => void;

export class ReadestTelemetryAdapter implements TelemetryPort {
  constructor(private readonly send: CaptureEvent = captureEvent) {}

  async capture(event: TelemetryEvent): Promise<void> {
    const parsed = betaTelemetryEventSchema.safeParse(event);
    if (!parsed.success) {
      // Fail closed: invalid properties may contain private content and must never reach analytics.
      console.warn('Learning telemetry event was rejected by its privacy contract');
      return;
    }
    const value = parsed.data;
    try {
      this.send(value.name, {
        event_id: value.id,
        contract_version: value.contractVersion,
        occurred_at: value.occurredAt.toISOString(),
        client_session_id: value.clientSessionId,
        ...(value.actorId ? { actor_id: value.actorId } : {}),
        ...value.properties,
      });
    } catch {
      // Telemetry must never block the learning loop or expose rejected payloads in logs.
      console.warn('Learning telemetry delivery failed');
    }
  }
}
