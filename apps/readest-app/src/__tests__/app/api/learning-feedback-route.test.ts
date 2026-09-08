import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateUserAndTokenMock = vi.fn();
const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...args: unknown[]) => validateUserAndTokenMock(...args),
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

import { POST } from '@/app/api/v1/feedback/route';

const request = (body: Record<string, unknown>, authenticated = false) =>
  new Request('https://example.test/api/v1/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer account-token' } : {}),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'user-1' },
    token: 'account-token',
  });
  singleMock.mockReset().mockResolvedValue({
    data: { id: 'feedback-1' },
    error: null,
  });
  selectMock.mockClear();
  insertMock.mockClear();
  fromMock.mockClear();
});

describe('POST /api/v1/feedback', () => {
  it('derives account ownership from authentication and stores only consented diagnostics', async () => {
    const response = await POST(
      request(
        {
          guestId: 'guest-1',
          message: 'The review return link helped me recover the original meaning.',
          diagnosticConsent: true,
          diagnostics: { route: '/review', locale: 'en', platform: 'web' },
        },
        true,
      ),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'feedback-1' });
    expect(fromMock).toHaveBeenCalledWith('learning_feedback');
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      guest_id: 'guest-1',
      message: 'The review return link helped me recover the original meaning.',
      diagnostic_consent: true,
      diagnostics: { route: '/review', locale: 'en', platform: 'web' },
    });
  });

  it('rejects diagnostics without explicit consent before writing anything', async () => {
    const response = await POST(
      request({
        guestId: 'guest-2',
        message: 'PDF selection did not work.',
        diagnosticConsent: false,
        diagnostics: { route: '/reader' },
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(insertMock).not.toHaveBeenCalled();
  });
});
