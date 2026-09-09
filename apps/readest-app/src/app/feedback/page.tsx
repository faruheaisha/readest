'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { LearningShell, LearningState } from '@/components/learning/LearningShell';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useLearningRuntime } from '@/learning/runtime';
import { TELEMETRY_EVENT_CONTRACT_VERSION } from '@/learning/domain';

type SubmissionStatus = 'idle' | 'submitting' | 'succeeded' | 'failed';

export default function FeedbackPage() {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { runtime, error } = useLearningRuntime(appService);
  const [message, setMessage] = useState('');
  const [diagnosticConsent, setDiagnosticConsent] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>('idle');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!runtime || message.trim().length < 3 || status === 'submitting') return;
    setStatus('submitting');
    try {
      await runtime.feedback.submit({
        message: message.trim(),
        diagnosticConsent,
        diagnostics: diagnosticConsent
          ? {
              route: window.location.pathname,
              locale: document.documentElement.lang || navigator.language,
              platform: 'web',
            }
          : undefined,
      });
      void runtime.telemetry.capture({
        id: `telemetry:feedback:${crypto.randomUUID()}`,
        contractVersion: TELEMETRY_EVENT_CONTRACT_VERSION,
        name: 'feedback_submitted',
        occurredAt: new Date(),
        clientSessionId: runtime.clientSessionId,
        actorId: runtime.guestId,
        properties: { category: 'other', route: window.location.pathname },
      });
      setMessage('');
      setStatus('succeeded');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <LearningShell
      title='Feedback'
      description='Tell us what blocked your learning or what made the reading-to-review loop useful.'
    >
      {error ? (
        <LearningState kind='error' message={_('Learning data could not be opened.')} />
      ) : (
        <form
          onSubmit={submit}
          className='border-base-300 max-w-2xl space-y-5 rounded-2xl border p-6'
        >
          <label className='block'>
            <span className='font-medium'>{_('What should we improve?')}</span>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (status !== 'idle') setStatus('idle');
              }}
              minLength={3}
              maxLength={4000}
              rows={7}
              required
              className='textarea textarea-bordered mt-2 w-full resize-y'
              placeholder={_(
                'Describe what you were trying to do, what happened, and what you expected.',
              )}
            />
          </label>

          <label className='flex items-start gap-3 text-sm'>
            <input
              type='checkbox'
              checked={diagnosticConsent}
              onChange={(event) => setDiagnosticConsent(event.target.checked)}
              className='checkbox checkbox-sm mt-0.5'
            />
            <span>
              {_(
                'Include route, interface language, and platform. Uploaded text, selections, notes, file names, and API keys are never included.',
              )}
            </span>
          </label>

          {status === 'succeeded' ? (
            <p role='status' className='text-success text-sm'>
              {_('Thank you. Your feedback was received.')}
            </p>
          ) : status === 'failed' ? (
            <p role='alert' className='text-error text-sm'>
              {_('Feedback could not be sent. Please try again.')}
            </p>
          ) : null}

          <button
            type='submit'
            disabled={!runtime || message.trim().length < 3 || status === 'submitting'}
            className='btn btn-primary'
          >
            {status === 'submitting' ? _('Sending…') : _('Send feedback')}
          </button>
        </form>
      )}
    </LearningShell>
  );
}
