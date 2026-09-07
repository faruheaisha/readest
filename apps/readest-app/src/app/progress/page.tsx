'use client';

import { useEffect, useMemo, useState } from 'react';
import { LearningShell, LearningState } from '@/components/learning/LearningShell';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import type { LearningEvent, SavedLearningObject } from '@/learning/domain';
import { useLearningRuntime } from '@/learning/runtime';

export default function ProgressPage() {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { runtime, error } = useLearningRuntime(appService);
  const [events, setEvents] = useState<readonly LearningEvent[] | null>(null);
  const [saved, setSaved] = useState<readonly SavedLearningObject[]>([]);

  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    void Promise.all([runtime.repository.list(), runtime.repository.listRecent(10_000)]).then(
      ([nextEvents, nextSaved]) => {
        if (cancelled) return;
        setEvents(nextEvents);
        setSaved(nextSaved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  const stats = useMemo(() => {
    const reviews = events?.filter((event) => event.type === 'review_completed').length ?? 0;
    const activeDays = new Set(events?.map((event) => event.occurredAt.toISOString().slice(0, 10)))
      .size;
    return [
      { label: 'Saved in context', value: saved.length },
      { label: 'Reviews completed', value: reviews },
      { label: 'Active learning days', value: activeDays },
    ];
  }, [events, saved]);

  return (
    <LearningShell
      title='Progress'
      description='Evidence from real reading and retrieval—not points invented to keep you busy.'
    >
      {error ? (
        <LearningState kind='error' message={_('Progress data could not be opened.')} />
      ) : events === null ? (
        <LearningState kind='loading' message={_('Building your learning evidence…')} />
      ) : (
        <>
          <div className='grid gap-4 sm:grid-cols-3'>
            {stats.map((stat) => (
              <section key={stat.label} className='border-base-300 rounded-2xl border p-5'>
                <p className='text-base-content/55 text-sm'>{_(stat.label)}</p>
                <p className='mt-2 text-3xl font-semibold tabular-nums'>{stat.value}</p>
              </section>
            ))}
          </div>
          <section className='mt-8'>
            <h2 className='text-lg font-medium'>{_('Recently saved')}</h2>
            {saved.length === 0 ? (
              <p className='text-base-content/55 mt-3'>{_('No learning objects saved yet.')}</p>
            ) : (
              <div className='mt-4 divide-y divide-base-300 rounded-2xl border border-base-300'>
                {saved.slice(0, 20).map((item) => (
                  <div key={item.id} className='flex items-center justify-between gap-4 px-5 py-4'>
                    <span className='font-medium'>{item.text}</span>
                    <span className='text-base-content/45 text-xs uppercase'>{_(item.kind)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </LearningShell>
  );
}
