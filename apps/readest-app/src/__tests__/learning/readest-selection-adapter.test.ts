import { describe, expect, it } from 'vitest';
import { createReadestSelectionContext } from '@/learning/adapters/readest-selection';

describe('Readest selection adapter', () => {
  it('preserves the content identity and stable reader locator', () => {
    const context = createReadestSelectionContext({
      book: {
        hash: 'book-hash',
        updatedAt: 42,
        title: 'Clinical English',
        filePath: '/books/clinical.epub',
        primaryLanguage: 'en-US',
      },
      bookKey: 'book-hash-window-1',
      selection: {
        text: 'differential diagnosis',
        cfi: 'epubcfi(/6/4!/4/2/2)',
        href: 'chapter-2.xhtml',
        page: 7,
      },
      progress: {
        sectionHref: 'chapter-2.xhtml',
        sectionLabel: 'Chapter 2',
        fraction: 0.25,
        page: 7,
      },
    });

    expect(context).toMatchObject({
      contentId: 'book-hash',
      contentVersionId: 'book-hash:42',
      text: 'differential diagnosis',
      language: 'en-US',
      locator: {
        href: 'chapter-2.xhtml',
        title: 'Chapter 2',
        locations: {
          cfi: 'epubcfi(/6/4!/4/2/2)',
          progression: 0.25,
          position: 7,
        },
        text: { highlight: 'differential diagnosis' },
      },
    });
  });

  it('falls back without inventing an unavailable CFI', () => {
    const context = createReadestSelectionContext({
      book: null,
      bookKey: 'transient-view',
      selection: { text: 'evidence', page: 0 },
      progress: null,
    });

    expect(context.contentId).toBe('transient-view');
    expect(context.contentVersionId).toBe('transient-view:local');
    expect(context.locator.locations).toEqual({});
    expect(context.locator.locations).not.toHaveProperty('cfi');
  });
});
