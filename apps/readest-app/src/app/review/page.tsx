'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearningShell, LearningState } from '@/components/learning/LearningShell';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import type {
  Occurrence,
  ReviewItem,
  ReviewRating,
  SavedLearningObject,
  Schedule,
} from '@/learning/domain';
import { useLearningRuntime } from '@/learning/runtime';
import { getReadestReturnTarget } from '@/learning/adapters';
import { navigateToReader } from '@/utils/nav';

interface DueCard {
  reviewItem: ReviewItem;
  schedule: Schedule;
  learningObject: SavedLearningObject;
  occurrence?: Occurrence;
}

const ratings: readonly { rating: ReviewRating; label: string; className: string }[] = [
  { rating: 'again', label: 'Again', className: 'btn-error' },
  { rating: 'hard', label: 'Hard', className: 'btn-warning' },
  { rating: 'good', label: 'Good', className: 'btn-success' },
  { rating: 'easy', label: 'Easy', className: 'btn-info' },
];

export default function ReviewPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { runtime, error } = useLearningRuntime(appService);
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSource, setLastSource] = useState<Occurrence | null>(null);

  const load = useCallback(async () => {
    if (!runtime) return;
    const due = await runtime.repository.listDue(new Date());
    const loaded = await Promise.all(
      due.map(async ({ reviewItem, schedule }) => {
        const learningObject = await runtime.repository.getLearningObject(
          reviewItem.learningObjectId,
        );
        if (!learningObject) return null;
        const occurrences = await runtime.repository.listOccurrences(learningObject.id);
        return { reviewItem, schedule, learningObject, occurrence: occurrences.at(-1) };
      }),
    );
    setCards(
      loaded.flatMap((card): DueCard[] =>
        card === null
          ? []
          : [
              {
                reviewItem: card.reviewItem,
                schedule: card.schedule,
                learningObject: card.learningObject,
                ...(card.occurrence ? { occurrence: card.occurrence } : {}),
              },
            ],
      ),
    );
    setRevealed(false);
  }, [runtime]);

  useEffect(() => {
    void load();
  }, [load]);

  const card = cards?.[0];
  const cloze = useMemo(() => {
    if (!card?.occurrence) return _('Recall this saved learning object.');
    const escaped = card.learningObject.text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return card.occurrence.contextText.replace(new RegExp(escaped, 'iu'), '______');
  }, [_, card]);

  const submit = async (rating: ReviewRating) => {
    if (!runtime || !card || submitting) return;
    setSubmitting(true);
    try {
      await runtime.orchestrator.submitReview(card.reviewItem.id, rating, crypto.randomUUID());
      setLastSource(card.occurrence ?? null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LearningShell
      title='Review'
      description='Retrieve the idea first, then rate honestly. Scheduling is derived from immutable review events.'
    >
      {error ? (
        <LearningState kind='error' message={_('Review data could not be opened.')} />
      ) : cards === null ? (
        <LearningState kind='loading' message={_('Loading due reviews…')} />
      ) : (
        <>
          {lastSource && (
            <div
              role='status'
              className='border-success/30 bg-success/5 mx-auto mb-5 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border px-5 py-4'
            >
              <p className='text-sm'>
                {_('Review saved. Reopen the source to strengthen the connection.')}
              </p>
              <button
                type='button'
                className='btn btn-success btn-sm shrink-0'
                onClick={() => {
                  const target = getReadestReturnTarget(lastSource);
                  navigateToReader(
                    router,
                    [target.bookHash],
                    `cfi=${encodeURIComponent(target.location)}`,
                  );
                }}
              >
                {_('Return to source')}
              </button>
            </div>
          )}
          {!card ? (
            <LearningState
              kind='empty'
              message={_('Nothing is due. Return to your reading and save only what matters.')}
            />
          ) : (
            <section className='border-base-300 bg-base-200/30 mx-auto max-w-2xl rounded-3xl border p-6 shadow-sm md:p-10'>
              <div className='flex items-center justify-between gap-4'>
                <span className='text-primary text-xs font-semibold tracking-wider uppercase'>
                  {_('Cloze')} · {_(card.learningObject.kind)}
                </span>
                <span className='text-base-content/45 text-sm'>
                  {cards.length} {_('due')}
                </span>
              </div>
              <p className='mt-8 text-xl leading-relaxed md:text-2xl'>{cloze}</p>
              {revealed ? (
                <div className='mt-8'>
                  <div className='bg-base-100 border-base-300 rounded-2xl border p-5'>
                    <p className='text-base-content/45 text-xs font-semibold uppercase'>
                      {_('Answer')}
                    </p>
                    <p className='mt-2 text-2xl font-semibold'>{card.learningObject.text}</p>
                    {card.occurrence && (
                      <p className='text-base-content/60 mt-3 text-sm'>
                        {card.occurrence.contextText}
                      </p>
                    )}
                  </div>
                  <div className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4'>
                    {ratings.map(({ rating, label, className }) => (
                      <button
                        key={rating}
                        type='button'
                        className={`btn btn-outline ${className}`}
                        disabled={submitting}
                        onClick={() => void submit(rating)}
                      >
                        {_(label)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  type='button'
                  className='btn btn-primary mt-10 w-full'
                  onClick={() => setRevealed(true)}
                >
                  {_('Show answer')}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </LearningShell>
  );
}
