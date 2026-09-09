'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LearningShell, LearningState } from '@/components/learning/LearningShell';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { TELEMETRY_EVENT_CONTRACT_VERSION } from '@/learning/domain';
import type { SavedLearningObject, TodayPlan } from '@/learning/domain';
import { useLearningRuntime } from '@/learning/runtime';

export default function TodayPage() {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { runtime, error } = useLearningRuntime(appService);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [objects, setObjects] = useState<Record<string, SavedLearningObject>>({});

  const recordPlanStart = () => {
    if (!runtime) return;
    void runtime.telemetry.capture({
      id: `telemetry:today-start:${crypto.randomUUID()}`,
      contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
      name: 'today_plan_started',
      occurredAt: new Date(),
      clientSessionId: runtime.clientSessionId,
      actorId: runtime.guestId,
      properties: { activityType: 'review' },
    });
  };

  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    void runtime.orchestrator.getTodayPlan().then(async (nextPlan) => {
      const ids = nextPlan.items.flatMap((item) =>
        item.kind === 'recent-save' ? [item.learningObjectId] : [],
      );
      const values = await Promise.all(ids.map((id) => runtime.repository.getLearningObject(id)));
      if (cancelled) return;
      setPlan(nextPlan);
      setObjects(
        Object.fromEntries(
          values
            .filter((value): value is SavedLearningObject => value !== null)
            .map((value) => [value.id, value]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  return (
    <LearningShell
      title='Today'
      description='Continue reading, review what is due, and return to the contexts that made it meaningful.'
    >
      {error ? (
        <LearningState kind='error' message={_('Learning data could not be opened.')} />
      ) : !plan ? (
        <LearningState kind='loading' message={_('Building today’s plan…')} />
      ) : plan.items.length === 0 ? (
        <div className='border-base-300 bg-base-200/40 rounded-2xl border p-8'>
          <h2 className='text-lg font-medium'>{_('Start with something you care about')}</h2>
          <p className='text-base-content/60 mt-2'>
            {_('Open a book, select useful English, and save it with its original context.')}
          </p>
          <Link href='/library' className='btn btn-primary btn-sm mt-5'>
            {_('Open Library')}
          </Link>
        </div>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          {plan.items.map((item) => {
            if (item.kind === 'review') {
              return (
                <Link
                  key={item.id}
                  href='/review'
                  onClick={recordPlanStart}
                  className='border-base-300 bg-base-200/40 hover:border-primary/40 rounded-2xl border p-5 transition-colors'
                >
                  <p className='text-primary text-xs font-semibold uppercase'>{_('Due review')}</p>
                  <h2 className='mt-2 text-lg font-medium'>{_('Strengthen a saved context')}</h2>
                  <p className='text-base-content/55 mt-1 text-sm'>{_('Review now')}</p>
                </Link>
              );
            }
            if (item.kind === 'recent-save') {
              const object = objects[item.learningObjectId];
              return (
                <div key={item.id} className='border-base-300 rounded-2xl border p-5'>
                  <p className='text-base-content/50 text-xs font-semibold uppercase'>
                    {_('Recent save')} · {_(object?.kind ?? 'expression')}
                  </p>
                  <h2 className='mt-2 text-lg font-medium'>{object?.text ?? _('Saved item')}</h2>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </LearningShell>
  );
}
