'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { FiBarChart2, FiBookOpen, FiCalendar, FiRotateCcw } from 'react-icons/fi';
import { useTranslation } from '@/hooks/useTranslation';

const navigation = [
  { href: '/today', label: 'Today', Icon: FiCalendar },
  { href: '/library', label: 'Library', Icon: FiBookOpen },
  { href: '/review', label: 'Review', Icon: FiRotateCcw },
  { href: '/progress', label: 'Progress', Icon: FiBarChart2 },
] as const;

export const LearningShell = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => {
  const pathname = usePathname();
  const _ = useTranslation();

  const links = navigation.map(({ href, label, Icon }) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={clsx(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
          active
            ? 'bg-primary text-primary-content shadow-sm'
            : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
        )}
      >
        <Icon className='h-4 w-4 shrink-0' aria-hidden='true' />
        <span>{_(label)}</span>
      </Link>
    );
  });

  return (
    <div className='bg-base-100 text-base-content flex min-h-dvh'>
      <aside className='border-base-300 hidden w-56 shrink-0 border-r px-4 py-6 md:block'>
        <div className='mb-8 px-3'>
          <p className='text-primary text-xs font-semibold tracking-[0.18em] uppercase'>
            English Learning OS
          </p>
        </div>
        <nav aria-label={_('Learning navigation')} className='space-y-1'>
          {links}
        </nav>
      </aside>
      <main className='mx-auto w-full max-w-5xl px-5 pt-8 pb-24 md:px-10 md:py-12'>
        <header className='mb-8'>
          <h1 className='text-3xl font-semibold tracking-tight'>{_(title)}</h1>
          <p className='text-base-content/60 mt-2 max-w-2xl'>{_(description)}</p>
        </header>
        {children}
      </main>
      <nav
        aria-label={_('Learning navigation')}
        className='bg-base-100/95 border-base-300 fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden'
      >
        {navigation.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px]',
                active ? 'text-primary' : 'text-base-content/55',
              )}
            >
              <Icon className='h-5 w-5' aria-hidden='true' />
              <span>{_(label)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export const LearningState = ({
  kind,
  message,
}: {
  kind: 'loading' | 'empty' | 'error';
  message: string;
}) => (
  <div
    role={kind === 'error' ? 'alert' : 'status'}
    className={clsx(
      'rounded-2xl border p-8 text-center',
      kind === 'error' ? 'border-error/30 bg-error/5 text-error' : 'border-base-300 bg-base-200/40',
    )}
  >
    {message}
  </div>
);
