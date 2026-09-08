import {
  getFromCache,
  getTranslators,
  isTranslatorAvailable,
  polish,
  preprocess,
  storeInCache,
} from '@/services/translators';
import type { SystemSettings } from '@/types/settings';
import { getAccessToken } from '@/utils/access';
import type { Artifact, ProviderMetadata, SelectionContext } from '../domain';
import type { TranslationProviderPort } from '../ports';

const RESULT_VERSION = 'readest-translation-v1';
const PROVIDER_VERSION = 'readest-0.12.6';

const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export class ReadestTranslationProviderAdapter implements TranslationProviderPort {
  readonly resultVersion = RESULT_VERSION;

  constructor(private readonly getSettings: () => SystemSettings) {}

  private async resolveProvider() {
    const settings = this.getSettings();
    const token = await getAccessToken();
    const available = getTranslators().filter((provider) =>
      isTranslatorAvailable(provider, token !== null),
    );
    const configured = settings.globalReadSettings?.translationProvider;
    const provider = available.find((candidate) => candidate.name === configured) ?? available[0];
    return { provider, token };
  }

  async describe(): Promise<ProviderMetadata> {
    const { provider } = await this.resolveProvider();
    return {
      id: `readest.translation.${provider?.name ?? 'unavailable'}`,
      version: PROVIDER_VERSION,
    };
  }

  async isAvailable(): Promise<boolean> {
    return (await this.resolveProvider()).provider !== undefined;
  }

  async translate(selection: SelectionContext, targetLanguage: string): Promise<Artifact> {
    const { provider, token } = await this.resolveProvider();
    if (!provider) throw new Error('No Readest translation provider is available');

    const input = preprocess([selection.text.replaceAll('\n', '').trim()])[0] ?? '';
    if (!input) throw new Error('Translation requires non-empty selected text');
    const sourceLanguage = 'AUTO';
    const cached = await getFromCache(input, sourceLanguage, targetLanguage, provider.name);
    const translated =
      cached ?? (await provider.translate([input], sourceLanguage, targetLanguage, token, true))[0];
    if (!translated) throw new Error('No translation found');
    if (!cached) {
      await storeInCache(input, translated, sourceLanguage, targetLanguage, provider.name);
    }
    const content = polish([translated], targetLanguage)[0] ?? translated;
    return {
      id: createId(),
      actionId: 'translation.translate',
      selection,
      kind: 'translation',
      content,
      language: targetLanguage,
      provider: {
        id: `readest.translation.${provider.name}`,
        version: PROVIDER_VERSION,
      },
      createdAt: new Date(),
    };
  }
}
