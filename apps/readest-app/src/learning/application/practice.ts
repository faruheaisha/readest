import type {
  ActivityKind,
  ActivityResult,
  ActivitySpec,
  Occurrence,
  SavedLearningObject,
} from '../domain';
import { LEARNING_EVENT_CONTRACT_VERSION } from '../domain';
import type { ActivityRegistry } from '../kernel';
import type { ActivityRepositoryPort, LearningEventPort } from '../ports';

export interface ActivityPracticeDependencies {
  registry: ActivityRegistry;
  repository: ActivityRepositoryPort;
  events: LearningEventPort;
  now?: () => Date;
  createId?: () => string;
  eventContext?: () => { clientSessionId: string; actorId?: string };
}

export class ActivityPracticeService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly eventContext: () => { clientSessionId: string; actorId?: string };

  constructor(private readonly dependencies: ActivityPracticeDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.eventContext = dependencies.eventContext ?? (() => ({ clientSessionId: 'local-session' }));
  }

  async createSpec(
    kind: ActivityKind,
    learningObject: SavedLearningObject,
    occurrence?: Occurrence,
  ): Promise<ActivitySpec> {
    const spec = this.dependencies.registry
      .requireKind(kind)
      .createSpec(this.createId(), learningObject, occurrence);
    await this.dependencies.repository.saveSpec(spec);
    return spec;
  }

  async complete(spec: ActivitySpec, response: string, startedAt: Date): Promise<ActivityResult> {
    const completedAt = this.now();
    const attempt = {
      id: this.createId(),
      activityId: spec.id,
      learningObjectId: spec.learningObjectId,
      response,
      startedAt,
      completedAt,
    };
    const result = this.dependencies.registry.requireKind(spec.kind).evaluate(attempt, spec);
    await this.dependencies.repository.saveAttempt(attempt, result);
    const context = this.eventContext();
    await this.dependencies.events.publish({
      id: `activity:${attempt.id}`,
      contractVersion: LEARNING_EVENT_CONTRACT_VERSION,
      type: 'activity_completed',
      occurredAt: completedAt,
      clientSessionId: context.clientSessionId,
      ...(context.actorId ? { actorId: context.actorId } : {}),
      aggregateId: spec.learningObjectId,
      properties: {
        activityType: spec.kind,
        resultBucket: result.correct ? 'correct' : 'incorrect',
        attemptId: attempt.id,
        memorySubjectId: spec.learningObjectId,
      },
    });
    return result;
  }
}
