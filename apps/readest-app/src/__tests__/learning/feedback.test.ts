import { describe, expect, it, vi } from 'vitest';
import { HttpFeedbackAdapter } from '@/learning';

describe('HttpFeedbackAdapter', () => {
  it('sends consented minimal diagnostics with guest identity and bearer authentication', async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ id: 'feedback-1' }, { status: 201 }),
    );
    const adapter = new HttpFeedbackAdapter({
      guestId: () => 'guest-1',
      accessToken: () => 'access-token',
      request,
    });

    const id = await adapter.submit({
      message: 'Returning to the original sentence should be easier.',
      diagnosticConsent: true,
      diagnostics: {
        route: '/review',
        locale: 'en',
        platform: 'web',
        appVersion: '0.9.80',
      },
    });

    expect(id).toBe('feedback-1');
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe('/api/v1/feedback');
    expect(init).toBeDefined();
    expect(init!.headers).toEqual({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init!.body))).toMatchObject({
      guestId: 'guest-1',
      message: 'Returning to the original sentence should be easier.',
      diagnosticConsent: true,
      diagnostics: { route: '/review', locale: 'en', platform: 'web' },
    });
  });

  it('never transmits diagnostics without explicit consent', async () => {
    const request = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ id: 'feedback-2' }, { status: 201 }),
    );
    const adapter = new HttpFeedbackAdapter({
      guestId: () => 'guest-2',
      accessToken: () => null,
      request,
    });

    await adapter.submit({
      message: 'PDF selection failed on this page.',
      diagnosticConsent: false,
      diagnostics: { route: '/reader', locale: 'zh-CN', platform: 'web' },
    });

    const [, init] = request.mock.calls[0]!;
    expect(init).toBeDefined();
    expect(init!.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init!.body))).not.toHaveProperty('diagnostics');
  });
});
