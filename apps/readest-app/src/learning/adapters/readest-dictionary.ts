import { buildLookupCandidates } from '@/services/dictionaries/lookupCandidates';
import type { DictionaryLookupOutcome, DictionaryProvider } from '@/services/dictionaries/types';
import type { Artifact, ProviderMetadata, SelectionContext } from '../domain';
import type { DictionaryProviderPort } from '../ports';

const RESULT_VERSION = 'readest-dictionary-text-v1';
const PROVIDER_VERSION = 'readest-0.12.6';
const BLOCK_ELEMENTS = new Set([
  'ADDRESS',
  'ARTICLE',
  'BLOCKQUOTE',
  'BR',
  'DD',
  'DIV',
  'DL',
  'DT',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const portableText = (root: ParentNode): string => {
  const chunks: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) chunks.push(node.textContent);
      return;
    }
    if (!(node instanceof Element)) {
      node.childNodes.forEach(visit);
      return;
    }
    if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT' || node.tagName === 'NOSCRIPT')
      return;
    if (node.tagName === 'BR') chunks.push('\n');
    const childRoot = node.shadowRoot ?? node;
    childRoot.childNodes.forEach(visit);
    if (BLOCK_ELEMENTS.has(node.tagName)) chunks.push('\n');
  };
  root.childNodes.forEach(visit);
  return chunks
    .join('')
    .replace(/[ \t]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
};

export class ReadestDictionaryProviderAdapter implements DictionaryProviderPort {
  readonly resultVersion = RESULT_VERSION;

  constructor(private readonly getProviders: () => readonly DictionaryProvider[]) {}

  private providers(): readonly DictionaryProvider[] {
    return this.getProviders().filter((provider) => provider.kind !== 'web');
  }

  async describe(): Promise<ProviderMetadata> {
    return {
      id: 'readest.dictionary',
      version: PROVIDER_VERSION,
      model: this.providers()
        .map((provider) => provider.id)
        .join(','),
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.providers().length > 0;
  }

  async lookup(selection: SelectionContext): Promise<Artifact> {
    const candidates = buildLookupCandidates(selection.text, selection.language);
    if (candidates.length === 0) throw new Error('Dictionary lookup requires selected text');

    const settled = await Promise.all(
      this.providers().map(async (provider) => {
        const container = document.createElement('div');
        const controller = new AbortController();
        let outcome: DictionaryLookupOutcome = { ok: false, reason: 'empty' };
        try {
          await provider.init?.();
          for (const candidate of candidates) {
            container.replaceChildren();
            outcome = await provider.lookup(candidate, {
              lang: selection.language,
              signal: controller.signal,
              container,
            });
            if (outcome.ok || outcome.reason !== 'empty') break;
          }
        } catch (error) {
          outcome = {
            ok: false,
            reason: 'error',
            message: error instanceof Error ? error.message : String(error),
          };
        }
        const definition = outcome.ok ? portableText(container) : '';
        return outcome.ok && definition
          ? {
              providerId: provider.id,
              label: outcome.sourceLabel ?? provider.label,
              headword: outcome.headword,
              definition,
            }
          : null;
      }),
    );
    const entries = settled.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (entries.length === 0) throw new Error('No dictionary definition found');

    return {
      id: createId(),
      actionId: 'dictionary.lookup',
      selection,
      kind: 'dictionary',
      content: entries
        .map(
          (entry) =>
            `${entry.label}${entry.headword ? ` — ${entry.headword}` : ''}\n${entry.definition}`,
        )
        .join('\n\n'),
      language: selection.language,
      provider: {
        id: 'readest.dictionary',
        version: PROVIDER_VERSION,
        model: entries.map((entry) => entry.providerId).join(','),
      },
      createdAt: new Date(),
    };
  }
}
