import type { Locator, SelectionContext } from '@/learning/domain';

interface ReadestBookIdentity {
  hash: string;
  updatedAt: number;
  title: string;
  filePath?: string;
  primaryLanguage?: string;
}

interface ReadestSelectionSnapshot {
  text: string;
  cfi?: string;
  href?: string;
  page: number;
}

interface ReadestProgressSnapshot {
  sectionHref: string;
  sectionLabel: string;
  fraction: number;
  page: number;
}

export const createReadestSelectionContext = ({
  book,
  bookKey,
  selection,
  progress,
}: {
  book: ReadestBookIdentity | null;
  bookKey: string;
  selection: ReadestSelectionSnapshot;
  progress: ReadestProgressSnapshot | null;
}): SelectionContext => {
  const contentId = book?.hash ?? bookKey;
  const href = selection.href || progress?.sectionHref || book?.filePath || bookKey;
  const position =
    selection.page > 0 ? selection.page : progress && progress.page > 0 ? progress.page : undefined;

  return {
    contentId,
    contentVersionId: `${contentId}:${book?.updatedAt ?? 'local'}`,
    text: selection.text.trim(),
    language: book?.primaryLanguage ?? 'en',
    locator: {
      href,
      ...(progress?.sectionLabel
        ? { title: progress.sectionLabel }
        : book?.title
          ? { title: book.title }
          : {}),
      locations: {
        ...(selection.cfi ? { cfi: selection.cfi } : {}),
        ...(progress ? { progression: progress.fraction } : {}),
        ...(position ? { position } : {}),
      },
      text: { highlight: selection.text.trim() },
    },
  };
};

export const getReadestReturnTarget = ({
  contentId,
  locator,
}: {
  contentId: string;
  locator: Locator;
}): { bookHash: string; location: string } => ({
  bookHash: contentId,
  location: locator.locations.cfi ?? locator.href,
});
