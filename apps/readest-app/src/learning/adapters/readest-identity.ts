import { supabase } from '@/utils/supabase';
import type { IdentityPort, LearningIdentityRepositoryPort } from '../ports';

export interface ReadestUserRecord {
  id: string;
  email?: string;
  emailConfirmedAt?: string;
}

const fromStoredUser = (): ReadestUserRecord | null => {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem('user');
  if (!value) return null;
  try {
    const user = JSON.parse(value) as {
      id?: unknown;
      email?: unknown;
      email_confirmed_at?: unknown;
    };
    if (typeof user.id !== 'string') return null;
    return {
      id: user.id,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(typeof user.email_confirmed_at === 'string'
        ? { emailConfirmedAt: user.email_confirmed_at }
        : {}),
    };
  } catch {
    return null;
  }
};

const loadReadestUser = async (): Promise<ReadestUserRecord | null> => {
  const stored = fromStoredUser();
  if (stored) return stored;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return {
    id: user.id,
    ...(user.email ? { email: user.email } : {}),
    ...(user.email_confirmed_at ? { emailConfirmedAt: user.email_confirmed_at } : {}),
  };
};

export class ReadestIdentityAdapter implements IdentityPort {
  readonly #identities: LearningIdentityRepositoryPort;
  readonly #loadUser: () => Promise<ReadestUserRecord | null>;
  readonly #now: () => Date;

  constructor(options: {
    identities: LearningIdentityRepositoryPort;
    loadUser?: () => Promise<ReadestUserRecord | null>;
    now?: () => Date;
  }) {
    this.#identities = options.identities;
    this.#loadUser = options.loadUser ?? loadReadestUser;
    this.#now = options.now ?? (() => new Date());
  }

  async currentSubject(): Promise<{ id: string; email?: string; verified: boolean } | null> {
    const user = await this.#loadUser();
    if (!user) return null;
    return {
      id: user.id,
      ...(user.email ? { email: user.email } : {}),
      verified: user.emailConfirmedAt !== undefined,
    };
  }

  migrateGuest(guestId: string, subjectId: string): Promise<void> {
    return this.#identities.linkGuestIdentity(guestId, subjectId, this.#now());
  }
}
