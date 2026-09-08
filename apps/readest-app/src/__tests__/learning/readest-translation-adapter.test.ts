import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFromCache,
  getTranslators,
  isTranslatorAvailable,
  polish,
  preprocess,
  storeInCache,
} from '@/services/translators';
import { getAccessToken } from '@/utils/access';
import { ReadestTranslationProviderAdapter } from '@/learning/adapters';
import type { SelectionContext } from '@/learning/domain';
import type { SystemSettings } from '@/types/settings';

vi.mock('@/services/translators', () => ({
  getFromCache: vi.fn(async () => null),
  getTranslators: vi.fn(),
  isTranslatorAvailable: vi.fn(() => true),
  polish: vi.fn((values: string[]) => values),
  preprocess: vi.fn((values: string[]) => values),
  storeInCache: vi.fn(async () => undefined),
}));
vi.mock('@/utils/access', () => ({ getAccessToken: vi.fn(async () => 'account-token') }));

const selection: SelectionContext = {
  contentId: 'book-1',
  contentVersionId: 'book-1-v1',
  text: 'break the ice',
  language: 'en',
  locator: {
    href: 'chapter.xhtml',
    locations: { progression: 0.5 },
    text: { before: 'She tried to ', highlight: 'break the ice', after: ' with a joke.' },
  },
};

const settings = {
  globalReadSettings: {
    translationProvider: 'google',
  },
} as SystemSettings;

describe('Readest translation learning adapter', () => {
  const translate = vi.fn(async () => ['打破僵局']);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue('account-token');
    vi.mocked(getTranslators).mockReturnValue([
      {
        name: 'google',
        label: 'Google',
        translate,
      },
    ]);
    vi.mocked(isTranslatorAvailable).mockReturnValue(true);
    vi.mocked(getFromCache).mockResolvedValue(null);
    vi.mocked(preprocess).mockImplementation((values) => values);
    vi.mocked(polish).mockImplementation((values) => values);
  });

  it('reuses the configured Readest provider and returns an owned Artifact', async () => {
    const adapter = new ReadestTranslationProviderAdapter(() => settings);

    const artifact = await adapter.translate(selection, 'zh-CN');

    expect(translate).toHaveBeenCalledWith(
      ['break the ice'],
      'AUTO',
      'zh-CN',
      'account-token',
      true,
    );
    expect(storeInCache).toHaveBeenCalledWith(
      'break the ice',
      '打破僵局',
      'AUTO',
      'zh-CN',
      'google',
    );
    expect(artifact).toMatchObject({
      actionId: 'translation.translate',
      kind: 'translation',
      content: '打破僵局',
      language: 'zh-CN',
      provider: { id: 'readest.translation.google' },
    });
    expect(artifact.selection).toBe(selection);
  });

  it('uses Readest translation cache before invoking the provider', async () => {
    vi.mocked(getFromCache).mockResolvedValue('缓存翻译');
    const adapter = new ReadestTranslationProviderAdapter(() => settings);

    const artifact = await adapter.translate(selection, 'zh-CN');

    expect(artifact.content).toBe('缓存翻译');
    expect(translate).not.toHaveBeenCalled();
    expect(storeInCache).not.toHaveBeenCalled();
  });
});
