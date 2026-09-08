'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiBookOpen, FiCheck, FiZap, FiX } from 'react-icons/fi';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import type { Artifact, LearningObjectKind, SelectionContext } from '@/learning/domain';
import { useLearningRuntime } from '@/learning/runtime';
import { useSettingsStore } from '@/store/settingsStore';
import { getUserID } from '@/utils/access';

const kinds: readonly LearningObjectKind[] = ['word', 'sense', 'expression', 'sentence'];

export const LearningContextPanel = ({
  selection,
  onDictionary,
  onClose,
}: {
  selection: SelectionContext;
  onDictionary: () => void;
  onClose: () => void;
}) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { runtime, loading, error } = useLearningRuntime(appService);
  const [kind, setKind] = useState<LearningObjectKind>(
    selection.text.trim().includes(' ') ? 'expression' : 'word',
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [explanation, setExplanation] = useState<Artifact | null>(null);
  const [translation, setTranslation] = useState<Artifact | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const explainRequest = useRef(0);
  const translationRequest = useRef(0);
  const targetLanguage = settings.globalReadSettings?.translateTargetLang || 'zh-CN';

  useEffect(() => {
    explainRequest.current += 1;
    translationRequest.current += 1;
    setKind(selection.text.trim().includes(' ') ? 'expression' : 'word');
    setSaved(false);
    setExplanation(null);
    setTranslation(null);
    setExplaining(false);
    setTranslating(false);
    setExplainError(null);
    setTranslationError(null);
  }, [selection]);

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

  const explain = async () => {
    if (!runtime || explaining) return;
    const request = ++explainRequest.current;
    setExplaining(true);
    setExplainError(null);
    try {
      const subjectId = await getUserID();
      const result = await runtime.execution.execute<Artifact>({
        actionId: 'ai.explain',
        selection,
        subjectId,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `ai-${Date.now()}`,
        locale: targetLanguage,
      });
      if (request === explainRequest.current) setExplanation(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (request === explainRequest.current) {
        setExplainError(
          message.includes('AI_DAILY_QUOTA_EXCEEDED')
            ? _(
                'Your daily AI allowance has been used. Reading, dictionary, and review still work.',
              )
            : _(
                'AI Explain is unavailable. Sign in for the platform allowance or configure your own provider in AI settings.',
              ),
        );
      }
    } finally {
      if (request === explainRequest.current) setExplaining(false);
    }
  };

  const translate = async () => {
    if (!runtime || translating) return;
    const request = ++translationRequest.current;
    setTranslating(true);
    setTranslationError(null);
    try {
      const subjectId = await getUserID();
      const result = await runtime.execution.execute<Artifact>({
        actionId: 'translation.translate',
        selection,
        subjectId,
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `translation-${Date.now()}`,
        locale: targetLanguage,
      });
      if (request === translationRequest.current) setTranslation(result);
    } catch {
      if (request === translationRequest.current) {
        setTranslationError(
          _('Translation is unavailable. Try another provider or try again later.'),
        );
      }
    } finally {
      if (request === translationRequest.current) setTranslating(false);
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
            <button
              type='button'
              className='btn btn-outline btn-sm'
              disabled={loading || translating}
              onClick={() => void translate()}
            >
              {translating ? _('Translating…') : _('Translation')}
            </button>
            <button
              type='button'
              className='btn btn-outline btn-sm col-span-2'
              disabled={loading || explaining}
              onClick={() => void explain()}
            >
              <FiZap aria-hidden='true' />
              {explaining ? _('Explaining…') : _('AI Explain')}
            </button>
          </div>
          {explanation && (
            <div className='bg-base-200/60 mt-3 rounded-2xl p-4'>
              <p className='text-base-content/50 text-xs font-semibold uppercase'>
                {_('AI Explain')}
              </p>
              <p className='mt-2 whitespace-pre-wrap text-sm'>{explanation.content}</p>
              <p className='text-base-content/40 mt-3 text-xs'>
                {explanation.provider.id} · {explanation.provider.model}
              </p>
            </div>
          )}
          {translation && (
            <div className='bg-base-200/60 mt-3 rounded-2xl p-4'>
              <p className='text-base-content/50 text-xs font-semibold uppercase'>
                {_('Translation')}
              </p>
              <p className='mt-2 whitespace-pre-wrap text-sm'>{translation.content}</p>
              <p className='text-base-content/40 mt-3 text-xs'>{translation.provider.id}</p>
            </div>
          )}
          {explainError && (
            <p role='alert' className='text-warning mt-3 text-sm'>
              {explainError}
            </p>
          )}
          {translationError && (
            <p role='alert' className='text-warning mt-3 text-sm'>
              {translationError}
            </p>
          )}
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
