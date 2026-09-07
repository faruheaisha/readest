import type {
  ActivityKind,
  ActivityResult,
  ActivitySpec,
  Occurrence,
  SavedLearningObject,
} from '../domain';
import type { ActivityRegistry } from '../kernel';
import type { ActivityRepositoryPort, LearningEventPort } from '../ports';

export interface ActivityPracticeDependencies {
  registry: ActivityRegistry;
  repository: ActivityRepositoryPort;
  events: LearningEventPort;
  now?: () => Date;
  createId?: () => string;
}

export class ActivityPracticeService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly dependencies: ActivityPracticeDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
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
    await this.dependencies.events.publish({
      id: this.createId(),
      type: 'practice_completed',
      occurredAt: completedAt,
      aggregateId: spec.learningObjectId,
      properties: { activity: spec.kind, correct: result.correct, score: result.score },
    });
    return result;
  }
}
