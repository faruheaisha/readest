'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { getLearningRuntime } from '@/learning/runtime';

export const LearningIdentityBridge = () => {
  const { appService } = useEnv();
  const { user } = useAuth();

  useEffect(() => {
    if (!appService || !user) return;
    void getLearningRuntime(appService)
      .then((runtime) => runtime.identity.migrateGuest(runtime.guestId, user.id))
      .catch(() => {
        console.warn('Learning identity migration could not be completed');
      });
  }, [appService, user]);

  return null;
};
