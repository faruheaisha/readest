import { afterEach, describe, expect, it } from 'vitest';
import {
  createReadestAnnotationDocumentLoader,
  ReadestAnnotationAdapter,
  type ReadestAnnotationDocumentLoader,
} from '@/learning/adapters/readest-annotation';
import type { Annotation } from '@/learning/domain';
import type { BookNote } from '@/types/book';
import type { Book, BookConfig } from '@/types/book';
import type { AppService } from '@/types/system';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';

const createSource = (initialNotes: readonly BookNote[] = []) => {
  const state = { notes: [...initialNotes], replaceCount: 0 };
  const load: ReadestAnnotationDocumentLoader = async (contentId) =>
    contentId === 'book-1'
      ? {
          contentId,
          contentVersionId: 'book-1:source',
          metaHash: 'meta-1',
          notes: state.notes,
          replace: async (notes) => {
            state.notes = [...notes];
            state.replaceCount += 1;
          },
        }
      : null;
  return { state, load };
};

const rawAnnotation = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'note-1',
  bookHash: 'book-1',
  metaHash: 'meta-1',
  type: 'annotation',
  cfi: 'epubcfi(/6/4!/4/2)',
  xpointer0: '/body/p[1]/text()[1].0',
  xpointer1: '/body/p[1]/text()[1].8',
  page: 3,
  text: 'evidence',
  style: 'underline',
  color: 'blue',
  note: 'Original note',
  global: true,
  createdAt: new Date('2026-09-01T12:00:00.000Z').getTime(),
  updatedAt: new Date('2026-09-02T12:00:00.000Z').getTime(),
  ...overrides,
});

const domainAnnotation = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: 'domain-1',
  contentId: 'book-1',
  contentVersionId: 'book-1:source',
  locator: {
    href: 'chapter.xhtml',
    locations: { cfi: 'epubcfi(/6/6!/4/2)', position: 5 },
    text: { highlight: 'clinical evidence' },
  },
  motivations: ['highlighting', 'commenting'],
  body: 'Remember this',
  sourceText: 'clinical evidence',
  createdAt: new Date('2026-09-03T12:00:00.000Z'),
  updatedAt: new Date('2026-09-03T12:00:00.000Z'),
  ...overrides,
});

describe('ReadestAnnotationAdapter', () => {
  afterEach(() => {
    useBookDataStore.setState({ booksData: {} });
    useLibraryStore.getState().setLibrary([]);
  });

  it('projects active BookNotes into the owned Annotation contract', async () => {
    const source = createSource([
      rawAnnotation(),
      rawAnnotation({ id: 'bookmark-1', type: 'bookmark', note: '', deletedAt: null }),
      rawAnnotation({ id: 'excerpt-1', type: 'excerpt', note: '', deletedAt: 10 }),
      rawAnnotation({ id: 'notebook-1', type: 'notebook' }),
    ]);
    const adapter = new ReadestAnnotationAdapter(source.load);

    const active = await adapter.listByContent('book-1');
    const all = await adapter.listByContent('book-1', { includeDeleted: true });

    expect(active.map((annotation) => annotation.id)).toEqual(['bookmark-1', 'note-1']);
    expect(all.map((annotation) => annotation.id)).toEqual([
      'bookmark-1',
      'excerpt-1',
      'note-1',
    ]);
    expect(active.find((annotation) => annotation.id === 'note-1')).toMatchObject({
      contentId: 'book-1',
      contentVersionId: 'book-1:source',
      motivations: ['highlighting', 'commenting'],
      body: 'Original note',
      sourceText: 'evidence',
      locator: {
        href: 'epubcfi(/6/4!/4/2)',
        locations: {
          cfi: 'epubcfi(/6/4!/4/2)',
          position: 3,
          fragment: '/body/p[1]/text()[1].0',
        },
      },
    });
  });

  it('updates through BookNote truth without erasing Readest presentation or sync metadata', async () => {
    const source = createSource([rawAnnotation()]);
    const adapter = new ReadestAnnotationAdapter(source.load);
    const current = (await adapter.listByContent('book-1'))[0]!;

    await adapter.save({
      ...current,
      body: 'Updated through the port',
      updatedAt: new Date('2026-09-04T12:00:00.000Z'),
    });

    expect(source.state.notes).toHaveLength(1);
    expect(source.state.notes[0]).toMatchObject({
      id: 'note-1',
      type: 'annotation',
      note: 'Updated through the port',
      style: 'underline',
      color: 'blue',
      global: true,
      xpointer0: '/body/p[1]/text()[1].0',
      xpointer1: '/body/p[1]/text()[1].8',
      createdAt: new Date('2026-09-01T12:00:00.000Z').getTime(),
      updatedAt: new Date('2026-09-04T12:00:00.000Z').getTime(),
    });
  });

  it('clears stale compatibility pointers when an annotation is re-anchored', async () => {
    const source = createSource([rawAnnotation()]);
    const adapter = new ReadestAnnotationAdapter(source.load);
    const current = (await adapter.listByContent('book-1'))[0]!;

    await adapter.save({
      ...current,
      locator: { ...current.locator, locations: { cfi: 'epubcfi(/6/8!/4/2)' } },
      updatedAt: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(source.state.notes[0]?.cfi).toBe('epubcfi(/6/8!/4/2)');
    expect(source.state.notes[0]).not.toHaveProperty('xpointer0');
    expect(source.state.notes[0]).not.toHaveProperty('xpointer1');
  });

  it('creates and tombstones annotations while preserving IDs for sync', async () => {
    const source = createSource();
    const adapter = new ReadestAnnotationAdapter(source.load);
    const bookmark = domainAnnotation({
      id: 'bookmark-new',
      motivations: ['bookmarking'],
      body: '',
    });
    const deletedAt = new Date('2026-09-06T12:00:00.000Z');

    await adapter.save(bookmark);
    await adapter.delete('book-1', bookmark.id, deletedAt);
    await adapter.delete('book-1', bookmark.id, deletedAt);

    expect(source.state.notes).toEqual([
      expect.objectContaining({
        id: 'bookmark-new',
        bookHash: 'book-1',
        metaHash: 'meta-1',
        type: 'bookmark',
        deletedAt: deletedAt.getTime(),
      }),
    ]);
    expect(source.state.replaceCount).toBe(2);
    expect(await adapter.listByContent('book-1')).toEqual([]);
    expect(await adapter.listByContent('book-1', { includeDeleted: true })).toHaveLength(1);
  });

  it('serializes writes and rejects anchors that Readest cannot persist', async () => {
    const source = createSource();
    const adapter = new ReadestAnnotationAdapter(source.load);

    await Promise.all([
      adapter.save(domainAnnotation({ id: 'parallel-1' })),
      adapter.save(domainAnnotation({ id: 'parallel-2' })),
    ]);
    await expect(
      adapter.save(
        domainAnnotation({
          id: 'invalid-anchor',
          locator: { href: 'chapter.xhtml', locations: {} },
        }),
      ),
    ).rejects.toThrow('stable CFI');

    expect(source.state.notes.map((note) => note.id)).toEqual(['parallel-1', 'parallel-2']);
    expect(source.state.replaceCount).toBe(2);
  });

  it('loads and persists closed-book annotations through the existing AppService', async () => {
    const book = {
      hash: 'book-1',
      format: 'EPUB',
      title: 'Evidence',
      author: 'Researcher',
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Book;
    const config = { metaHash: 'meta-1', booknotes: [], updatedAt: 1 } as BookConfig;
    const saves: BookConfig[] = [];
    const appService = {
      loadBookConfig: async () => config,
      saveBookConfig: async (_book: Book, saved: BookConfig) => {
        saves.push(saved);
      },
    } as unknown as AppService;
    useLibraryStore.getState().setLibrary([book]);
    const load = createReadestAnnotationDocumentLoader(appService);
    const document = await load('book-1');

    expect(document?.contentVersionId).toBe('book-1:source');
    await document?.replace([rawAnnotation()]);

    expect(saves).toHaveLength(1);
    expect(saves[0]?.booknotes?.[0]).toMatchObject({ id: 'note-1', cfi: 'epubcfi(/6/4!/4/2)' });
  });
});
