'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearningShell, LearningState } from '@/components/learning/LearningShell';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import type {
  ActivityKind,
  ActivityResult,
  ActivitySpec,
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

const activityKinds: readonly ActivityKind[] = ['recognition', 'typing', 'spelling', 'cloze'];

export default function ReviewPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { runtime, error } = useLearningRuntime(appService);
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSource, setLastSource] = useState<Occurrence | null>(null);
  const [activityKind, setActivityKind] = useState<ActivityKind>('cloze');
  const [activitySpec, setActivitySpec] = useState<ActivitySpec | null>(null);
  const [activityResult, setActivityResult] = useState<ActivityResult | null>(null);
  const [response, setResponse] = useState('');
  const [startedAt, setStartedAt] = useState(() => new Date());

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

  useEffect(() => {
    if (!runtime || !card) {
      setActivitySpec(null);
      return;
    }
    let cancelled = false;
    setActivitySpec(null);
    setActivityResult(null);
    setResponse('');
    setRevealed(false);
    setStartedAt(new Date());
    void runtime.practice
      .createSpec(activityKind, card.learningObject, card.occurrence)
      .then((spec) => {
        if (!cancelled) setActivitySpec(spec);
      });
    return () => {
      cancelled = true;
    };
  }, [activityKind, card?.reviewItem.id, runtime]);

  const checkActivity = async () => {
    if (!runtime || !activitySpec || !response.trim() || activityResult) return;
    const result = await runtime.practice.complete(activitySpec, response, startedAt);
    setActivityResult(result);
    setRevealed(true);
  };

  const submit = async (rating: ReviewRating) => {
    if (!runtime || !card || submitting) return;
    setSubmitting(true);
    try {
      if (activitySpec && activityKind === 'recognition' && !activityResult) {
        await runtime.practice.complete(
          activitySpec,
          rating === 'good' || rating === 'easy' ? 'known' : 'missed',
          startedAt,
        );
      }
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
                  {_(activityKind)} · {_(card.learningObject.kind)}
                </span>
                <span className='text-base-content/45 text-sm'>
                  {cards.length} {_('due')}
                </span>
              </div>
              <div className='mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                {activityKinds.map((kind) => (
                  <button
                    key={kind}
                    type='button'
                    aria-pressed={activityKind === kind}
                    className={`btn btn-sm ${activityKind === kind ? 'btn-primary' : 'btn-ghost bg-base-200'}`}
                    onClick={() => setActivityKind(kind)}
                  >
                    {_(kind)}
                  </button>
                ))}
              </div>
              {!activitySpec ? (
                <p className='text-base-content/55 mt-8 text-center'>{_('Preparing activity…')}</p>
              ) : (
                <>
                  <p className='mt-8 text-xl leading-relaxed md:text-2xl'>
                    {activityKind === 'spelling'
                      ? _('Listen and spell the saved item.')
                      : activitySpec.prompt === 'Complete the saved item.'
                        ? _('Complete the saved item.')
                        : activitySpec.prompt}
                  </p>
                  {activityKind === 'spelling' && (
                    <button
                      type='button'
                      className='btn btn-outline btn-sm mt-4'
                      disabled={typeof window === 'undefined' || !('speechSynthesis' in window)}
                      onClick={() => {
                        const utterance = new SpeechSynthesisUtterance(activitySpec.answer);
                        utterance.lang = card.learningObject.language;
                        window.speechSynthesis.speak(utterance);
                      }}
                    >
                      {_('Listen')}
                    </button>
                  )}
                  {activityKind !== 'recognition' && !revealed && (
                    <div className='mt-6 flex flex-col gap-3 sm:flex-row'>
                      <input
                        type='text'
                        autoCapitalize='none'
                        autoComplete='off'
                        spellCheck={false}
                        className='input input-bordered flex-1'
                        value={response}
                        aria-label={_('Your answer')}
                        onChange={(event) => setResponse(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void checkActivity();
                        }}
                      />
                      <button
                        type='button'
                        className='btn btn-primary'
                        disabled={!response.trim()}
                        onClick={() => void checkActivity()}
                      >
                        {_('Check answer')}
                      </button>
                    </div>
                  )}
                </>
              )}
              {revealed ? (
                <div className='mt-8'>
                  <div className='bg-base-100 border-base-300 rounded-2xl border p-5'>
                    <p className='text-base-content/45 text-xs font-semibold uppercase'>
                      {_('Answer')}
                    </p>
                    <p className='mt-2 text-2xl font-semibold'>{card.learningObject.text}</p>
                    {activityResult && (
                      <p
                        className={`mt-3 text-sm font-medium ${activityResult.correct ? 'text-success' : 'text-warning'}`}
                      >
                        {activityResult.correct
                          ? _('Correct')
                          : _('Not quite—compare and try again later.')}
                      </p>
                    )}
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
              ) : activityKind === 'recognition' && activitySpec ? (
                <button
                  type='button'
                  className='btn btn-primary mt-10 w-full'
                  onClick={() => setRevealed(true)}
                >
                  {_('Show answer')}
                </button>
              ) : null}
            </section>
          )}
        </>
      )}
    </LearningShell>
  );
}
