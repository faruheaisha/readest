import type {
  ActivityAttempt,
  ActivityKind,
  ActivityResult,
  ActivitySpec,
  Occurrence,
  SavedLearningObject,
} from '../domain';
import type { ActivityEnginePort } from '../ports';

const normalizeAnswer = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const contextCloze = (learningObject: SavedLearningObject, occurrence?: Occurrence): string => {
  if (!occurrence) return 'Complete the saved item.';
  return occurrence.contextText.replace(
    new RegExp(escapeRegExp(learningObject.text), 'iu'),
    '______',
  );
};

class RuleBasedActivityEngine implements ActivityEnginePort {
  constructor(readonly kind: ActivityKind) {}

  createSpec(
    id: string,
    learningObject: SavedLearningObject,
    occurrence?: Occurrence,
  ): ActivitySpec {
    const prompt =
      this.kind === 'recognition'
        ? (occurrence?.contextText ?? learningObject.text)
        : this.kind === 'spelling'
          ? 'Listen and spell the saved item.'
          : contextCloze(learningObject, occurrence);
    return {
      id,
      kind: this.kind,
      learningObjectId: learningObject.id,
      prompt,
      answer: learningObject.text,
      ...(occurrence ? { sourceLocator: occurrence.locator } : {}),
    };
  }

  evaluate(attempt: ActivityAttempt, spec: ActivitySpec): ActivityResult {
    const correct =
      this.kind === 'recognition'
        ? attempt.response === 'known'
        : normalizeAnswer(attempt.response) === normalizeAnswer(spec.answer);
    const completedAt = attempt.completedAt ?? new Date();
    return {
      attemptId: attempt.id,
      correct,
      score: correct ? 1 : 0,
      durationMs: Math.max(0, completedAt.getTime() - attempt.startedAt.getTime()),
      completedAt,
    };
  }
}

export const createActivityEngines = (): readonly ActivityEnginePort[] =>
  (['recognition', 'typing', 'spelling', 'cloze'] as const).map(
    (kind) => new RuleBasedActivityEngine(kind),
  );
