'use client';

import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import type { ContentOpenSource } from '@/learning/application';
import { useLearningRuntime } from '@/learning/runtime';

const getOpenSource = (): ContentOpenSource => {
  if (typeof window === 'undefined') return 'unknown';
  const source = new URLSearchParams(window.location.search).get('eloSource');
  if (
    source === 'library' ||
    source === 'today' ||
    source === 'review' ||
    source === 'import' ||
    source === 'search'
  ) {
    return source;
  }
  return 'unknown';
};

export const LearningContentOpenTracker = ({
  bookKey,
  ready,
}: {
  bookKey: string;
  ready: boolean;
}) => {
  const { appService } = useEnv();
  const { runtime } = useLearningRuntime(appService);

  useEffect(() => {
    if (!runtime || !ready) return;
    const contentId = bookKey.split('-')[0];
    if (!contentId) return;
    void runtime.evidence.recordContentOpened(contentId, getOpenSource(), bookKey);
  }, [bookKey, ready, runtime]);

  return null;
};
