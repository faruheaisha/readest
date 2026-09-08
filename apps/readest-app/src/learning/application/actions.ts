import type { Artifact, SelectionContext } from '../domain';
import type { AIProviderPort, ArtifactCachePort } from '../ports';
import type { ActionHandler } from '../kernel/runtimes';
import { ProviderRouter } from '../kernel/registry';

const stableContext = (selection: SelectionContext): string =>
  JSON.stringify({
    contentId: selection.contentId,
    contentVersionId: selection.contentVersionId,
    text: selection.text,
    language: selection.language,
    href: selection.locator.href,
    locations: selection.locator.locations,
    locatorText: selection.locator.text,
  });

const hash = (value: string): string => {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
};

export const createArtifactCacheKey = (input: {
  actionId: string;
  selection: SelectionContext;
  promptVersion: string;
  providerId: string;
  model?: string;
  locale: string;
}): string =>
  [
    input.actionId,
    hash(stableContext(input.selection)),
    input.promptVersion,
    input.providerId,
    input.model ?? 'default',
    input.locale,
  ].join(':');

export class AIExplainActionHandler implements ActionHandler<Artifact> {
  constructor(
    private readonly dependencies: {
      providers: ProviderRouter<AIProviderPort>;
      cache: ArtifactCachePort;
    },
  ) {}

  async execute(
    selection: SelectionContext,
    context: { action: { id: string }; locale: string },
  ): Promise<Artifact> {
    const provider = await this.dependencies.providers.resolve('ai.explain');
    const metadata = provider.describe();
    const key = createArtifactCacheKey({
      actionId: context.action.id,
      selection,
      promptVersion: provider.promptVersion,
      providerId: metadata.id,
      model: metadata.model,
      locale: context.locale,
    });
    const cached = await this.dependencies.cache.getArtifact(key);
    if (cached) return cached;

    const artifact = await provider.explain(selection, context.locale);
    await this.dependencies.cache.putArtifact(key, artifact);
    return artifact;
  }
}
