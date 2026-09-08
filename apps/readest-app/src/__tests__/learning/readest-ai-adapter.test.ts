import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { getAIProvider } from '@/services/ai/providers';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { PlatformAIProviderAdapter, ReadestAIProviderAdapter } from '@/learning/adapters';
import type { SelectionContext } from '@/learning/domain';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('@/services/ai/providers', () => ({ getAIProvider: vi.fn() }));
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

beforeEach(() => {
  vi.mocked(generateText)
    .mockReset()
    .mockResolvedValue({ text: '用于打破尴尬，开启交流。' } as never);
  vi.mocked(getAIProvider)
    .mockReset()
    .mockReturnValue({
      id: 'openrouter',
      name: 'OpenAI compatible',
      requiresAuth: true,
      getModel: () => ({ specificationVersion: 'v2' }) as never,
      getEmbeddingModel: vi.fn(),
      isAvailable: async () => true,
      healthCheck: async () => true,
    });
});

describe('Readest AI learning adapters', () => {
  it('reuses the configured Readest provider without exposing its key to the prompt', async () => {
    const adapter = new ReadestAIProviderAdapter(() => ({
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      provider: 'openrouter',
      openrouterApiKey: 'super-secret-key',
      openrouterModel: 'small-model',
    }));

    const artifact = await adapter.explain(selection, 'zh-CN');

    expect(artifact.content).toBe('用于打破尴尬，开启交流。');
    expect(artifact.provider).toMatchObject({ id: 'readest.openrouter', model: 'small-model' });
    const request = vi.mocked(generateText).mock.calls[0]?.[0];
    expect(JSON.stringify(request)).not.toContain('super-secret-key');
    expect(JSON.stringify(request)).toContain('break the ice');
  });

  it('uses the authenticated platform route without sending a user API key', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer account-token' });
      expect(String(init?.body)).not.toContain('apiKey');
      return new Response('A concise explanation.', { status: 200 });
    });
    const adapter = new PlatformAIProviderAdapter({ fetch: fetchMock });

    const artifact = await adapter.explain(selection, 'en');

    expect(artifact.content).toBe('A concise explanation.');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(artifact.provider.id).toBe('english-learning-os.platform-ai');
  });
});
