import type { LexicalGraph, SavedLearningObject } from './models';

export const assertLexicalGraph = (
  learningObject: SavedLearningObject,
  graph: LexicalGraph,
): void => {
  if (learningObject.kind === 'word' || learningObject.kind === 'sense') {
    if (!graph.lexeme || graph.forms.length === 0) {
      throw new Error(`${learningObject.kind} requires a Lexeme and at least one Form`);
    }
    if (
      graph.lexeme.language !== learningObject.language ||
      graph.lexeme.normalizedLemma !== learningObject.normalizedText
    ) {
      throw new Error('Lexeme identity does not match its learning object');
    }
    if (
      graph.forms.some(
        (form) =>
          form.lexemeId !== graph.lexeme?.id || form.language !== learningObject.language,
      )
    ) {
      throw new Error('Form identity does not match its Lexeme');
    }
    if (learningObject.kind === 'sense') {
      if (!graph.sense || graph.sense.lexemeId !== graph.lexeme.id) {
        throw new Error('sense requires a Sense node owned by its Lexeme');
      }
    } else if (graph.sense) {
      throw new Error('word cannot own a Sense node');
    }
    if (graph.expression) throw new Error(`${learningObject.kind} cannot own an Expression node`);
    return;
  }

  if (
    !graph.expression ||
    graph.expression.expressionType !== learningObject.kind ||
    graph.expression.language !== learningObject.language ||
    graph.expression.normalizedText !== learningObject.normalizedText
  ) {
    throw new Error(`${learningObject.kind} requires a matching Expression node`);
  }
  if (graph.lexeme || graph.sense || graph.forms.length > 0) {
    throw new Error(`${learningObject.kind} cannot own Lexeme, Form, or Sense nodes`);
  }
};
