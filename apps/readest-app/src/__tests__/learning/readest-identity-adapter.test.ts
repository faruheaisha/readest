import { describe, expect, it, vi } from 'vitest';
import { ReadestIdentityAdapter } from '@/learning/adapters';
import type { LearningIdentityRepositoryPort } from '@/learning/ports';

const repository = (): LearningIdentityRepositoryPort => ({
  getOrCreateGuestId: vi.fn(async (candidate: string) => candidate),
  linkGuestIdentity: vi.fn(async () => undefined),
  getLinkedSubject: vi.fn(async () => null),
});

describe('ReadestIdentityAdapter', () => {
  it('maps the existing Readest account into the stable IdentityPort shape', async () => {
    const identities = repository();
    const adapter = new ReadestIdentityAdapter({
      identities,
      loadUser: async () => ({
        id: 'subject-1',
        email: 'reader@example.com',
        emailConfirmedAt: '2026-09-08T12:00:00.000Z',
      }),
    });

    expect(await adapter.currentSubject()).toEqual({
      id: 'subject-1',
      email: 'reader@example.com',
      verified: true,
    });
  });

  it('migrates by linking ownership and leaves guest-owned entity IDs untouched', async () => {
    const identities = repository();
    const adapter = new ReadestIdentityAdapter({ identities, loadUser: async () => null });

    await adapter.migrateGuest('guest-1', 'subject-1');

    expect(identities.linkGuestIdentity).toHaveBeenCalledWith(
      'guest-1',
      'subject-1',
      expect.any(Date),
    );
  });
});
