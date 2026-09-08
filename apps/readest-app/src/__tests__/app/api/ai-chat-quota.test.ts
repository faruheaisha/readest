import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateUserAndTokenMock = vi.fn();
const getCurrentUsageMock = vi.fn();
const trackUsageMock = vi.fn();
const streamTextMock = vi.fn();
const gatewayModelMock = vi.fn(() => ({ modelId: 'test-model' }));

vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...args: unknown[]) => validateUserAndTokenMock(...args),
}));
vi.mock('@/utils/usage', () => ({
  USAGE_TYPES: { AI_ACTIONS: 'ai_actions' },
  UsageStatsManager: {
    getCurrentUsage: (...args: unknown[]) => getCurrentUsageMock(...args),
    trackUsage: (...args: unknown[]) => trackUsageMock(...args),
  },
}));
vi.mock('ai', () => ({
  createGateway: vi.fn(() => gatewayModelMock),
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));

import { POST } from '@/app/api/ai/chat/route';

const request = (body: Record<string, unknown>) =>
  new Request('https://example.test/api/ai/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer account-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Explain this.' }], ...body }),
  });

beforeEach(() => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'platform-secret');
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'user-1' },
    token: 'account-token',
  });
  getCurrentUsageMock.mockReset().mockResolvedValue(0);
  trackUsageMock.mockReset().mockResolvedValue(1);
  streamTextMock.mockReset().mockReturnValue({
    toTextStreamResponse: () => new Response('explanation'),
  });
  gatewayModelMock.mockClear();
});

describe('POST /api/ai/chat platform allowance', () => {
  it('rejects a platform-funded action after the configurable daily allowance', async () => {
    getCurrentUsageMock.mockResolvedValue(10);

    const response = await POST(request({}));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'AI_DAILY_QUOTA_EXCEEDED' });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('records a platform-funded action before dispatching the model request', async () => {
    const response = await POST(request({ model: 'openai/expensive-model' }));

    expect(response.status).toBe(200);
    expect(getCurrentUsageMock).toHaveBeenCalledWith('user-1', 'ai_actions', 'daily');
    expect(trackUsageMock).toHaveBeenCalledWith('user-1', 'ai_actions', 1, {
      source: 'english_learning_action',
    });
    expect(streamTextMock).toHaveBeenCalledOnce();
    expect(gatewayModelMock).toHaveBeenCalledWith('google/gemini-2.5-flash-lite');
  });

  it('rejects oversized platform input before consuming allowance', async () => {
    const response = await POST(
      request({ messages: [{ role: 'user', content: 'x'.repeat(12_001) }] }),
    );

    expect(response.status).toBe(413);
    expect(trackUsageMock).not.toHaveBeenCalled();
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it('does not charge the platform allowance when the user supplies a gateway key', async () => {
    const response = await POST(request({ apiKey: 'byok-secret' }));

    expect(response.status).toBe(200);
    expect(getCurrentUsageMock).not.toHaveBeenCalled();
    expect(trackUsageMock).not.toHaveBeenCalled();
  });
});
