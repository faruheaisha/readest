'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiBookOpen, FiCheck, FiX } from 'react-icons/fi';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import type { LearningObjectKind, SelectionContext } from '@/learning/domain';
import { useLearningRuntime } from '@/learning/runtime';

const kinds: readonly LearningObjectKind[] = ['word', 'sense', 'expression', 'sentence'];

export const LearningContextPanel = ({
  selection,
  onDictionary,
  onTranslation,
  onClose,
}: {
  selection: SelectionContext;
  onDictionary: () => void;
  onTranslation: () => void;
  onClose: () => void;
}) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { runtime, loading, error } = useLearningRuntime(appService);
  const [kind, setKind] = useState<LearningObjectKind>(
    selection.text.trim().includes(' ') ? 'expression' : 'word',
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (practice: boolean) => {
    if (!runtime || saving) return;
    setSaving(true);
    try {
      const result = await runtime.orchestrator.saveSelection(selection, kind);
      if (practice) {
        await runtime.orchestrator.ensureReviewItem(result.learningObject.id);
        router.push('/review');
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      aria-label={_('Learning context')}
      className='bg-base-100 border-base-300 fixed right-0 bottom-0 z-[60] flex max-h-[82dvh] w-full flex-col rounded-t-3xl border-t shadow-2xl sm:top-0 sm:h-full sm:max-h-none sm:w-[390px] sm:rounded-none sm:border-t-0 sm:border-l'
    >
      <header className='border-base-300 flex items-start justify-between gap-4 border-b px-5 py-4'>
        <div>
          <p className='text-primary text-xs font-semibold uppercase'>{_('Source context')}</p>
          <h2 className='mt-1 line-clamp-2 text-lg font-semibold'>{selection.text}</h2>
        </div>
        <button type='button' className='btn btn-ghost btn-circle btn-sm' onClick={onClose}>
          <FiX aria-hidden='true' />
          <span className='sr-only'>{_('Close')}</span>
        </button>
      </header>
      <div className='flex-1 space-y-6 overflow-y-auto p-5'>
        <section>
          <h3 className='text-base-content/50 text-xs font-semibold uppercase'>
            {_('Understand')}
          </h3>
          <div className='mt-3 grid grid-cols-2 gap-3'>
            <button type='button' className='btn btn-outline btn-sm' onClick={onDictionary}>
              {_('Meaning')}
            </button>
            <button type='button' className='btn btn-outline btn-sm' onClick={onTranslation}>
              {_('Translation')}
            </button>
          </div>
          <p className='text-base-content/45 mt-3 text-xs'>
            {_(
              'Dictionary and translation reuse Readest providers. AI Explain will use the same action runtime when a provider is configured.',
            )}
          </p>
        </section>
        <section>
          <h3 className='text-base-content/50 text-xs font-semibold uppercase'>{_('Save as')}</h3>
          <div className='mt-3 flex flex-wrap gap-2'>
            {kinds.map((value) => (
              <button
                key={value}
                type='button'
                aria-pressed={kind === value}
                className={`btn btn-sm ${kind === value ? 'btn-primary' : 'btn-ghost bg-base-200'}`}
                onClick={() => setKind(value)}
              >
                {_(value)}
              </button>
            ))}
          </div>
        </section>
        <section className='bg-base-200/60 rounded-2xl p-4'>
          <div className='flex items-center gap-2'>
            <FiBookOpen className='text-primary' aria-hidden='true' />
            <p className='text-sm font-medium'>
              {selection.locator.title ?? selection.locator.href}
            </p>
          </div>
          <p className='text-base-content/55 mt-2 line-clamp-3 text-sm'>
            {selection.locator.text?.before} <mark>{selection.locator.text?.highlight}</mark>{' '}
            {selection.locator.text?.after}
          </p>
        </section>
        {error && (
          <p role='alert' className='text-error text-sm'>
            {_('Learning data could not be opened.')}
          </p>
        )}
        {saved && (
          <p role='status' className='text-success flex items-center gap-2 text-sm'>
            <FiCheck aria-hidden='true' /> {_('Saved with its source context.')}
          </p>
        )}
      </div>
      <footer className='border-base-300 grid grid-cols-2 gap-3 border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]'>
        <button
          type='button'
          className='btn btn-outline'
          disabled={loading || saving || saved}
          onClick={() => void save(false)}
        >
          {_('Save')}
        </button>
        <button
          type='button'
          className='btn btn-primary'
          disabled={loading || saving || saved}
          onClick={() => void save(true)}
        >
          {_('Save & practice')}
        </button>
      </footer>
    </aside>
  );
};
