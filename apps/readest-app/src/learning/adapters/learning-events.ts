import type { EventRuntime } from '../kernel';
import type { LearningEventPort } from '../ports';
import type { LearningEvent } from '../domain';

export class LearningEventRuntimeAdapter implements LearningEventPort {
  constructor(
    private readonly repository: LearningEventPort,
    private readonly runtime: EventRuntime,
  ) {}

  async publish(event: LearningEvent): Promise<void> {
    await this.repository.publish(event);
    await this.runtime.publish(event);
  }

  list(): Promise<readonly LearningEvent[]> {
    return this.repository.list();
  }
}
