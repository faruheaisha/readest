import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { BookNote } from '@/types/book';
import type { AppService } from '@/types/system';
import type { Annotation } from '../domain';
import type { AnnotationRepositoryPort } from '../ports';
import { getReadestContentVersionId } from './readest-selection';

export interface ReadestAnnotationDocument {
  contentId: string;
  contentVersionId: string;
  metaHash?: string;
  notes: readonly BookNote[];
  replace(notes: readonly BookNote[]): Promise<void>;
}

export type ReadestAnnotationDocumentLoader = (
  contentId: string,
) => Promise<ReadestAnnotationDocument | null>;

const motivationsFor = (note: BookNote): Annotation['motivations'] => {
  if (note.type === 'bookmark') return ['bookmarking'];
  if (note.type === 'excerpt') return ['classifying'];
  return note.note.trim() ? ['highlighting', 'commenting'] : ['highlighting'];
};

export const toDomainAnnotation = (
  note: BookNote,
  document: Pick<ReadestAnnotationDocument, 'contentId' | 'contentVersionId'>,
): Annotation => ({
  id: note.id,
  contentId: document.contentId,
  contentVersionId: document.contentVersionId,
  locator: {
    // BookNote does not persist the spine href. Its canonical CFI remains a
    // valid return target and is never replaced with an invented resource URL.
    href: note.cfi,
    locations: {
      cfi: note.cfi,
      ...(note.page && note.page > 0 ? { position: note.page } : {}),
      ...(note.xpointer0 ? { fragment: note.xpointer0 } : {}),
    },
    ...(note.text ? { text: { highlight: note.text } } : {}),
  },
  motivations: motivationsFor(note),
  ...(note.note ? { body: note.note } : {}),
  ...(note.text ? { sourceText: note.text } : {}),
  createdAt: new Date(note.createdAt),
  updatedAt: new Date(note.updatedAt),
  ...(note.deletedAt !== undefined
    ? { deletedAt: note.deletedAt === null ? null : new Date(note.deletedAt) }
    : {}),
});

const noteTypeFor = (annotation: Annotation): BookNote['type'] => {
  if (annotation.motivations.includes('bookmarking')) return 'bookmark';
  if (
    annotation.motivations.includes('classifying') &&
    !annotation.motivations.includes('highlighting') &&
    !annotation.motivations.includes('commenting')
  ) {
    return 'excerpt';
  }
  return 'annotation';
};

const cfiFor = (annotation: Annotation): string | null => {
  if (annotation.locator.locations.cfi) return annotation.locator.locations.cfi;
  return annotation.locator.href.startsWith('epubcfi(') ? annotation.locator.href : null;
};

const mergeBookNote = (
  annotation: Annotation,
  document: ReadestAnnotationDocument,
  existing?: BookNote,
): BookNote => {
  const cfi = cfiFor(annotation);
  if (!cfi) throw new Error('Readest annotations require a stable CFI anchor');

  const anchorChanged = existing !== undefined && existing.cfi !== cfi;
  const note: BookNote = {
    ...(existing ?? {}),
    id: annotation.id,
    bookHash: annotation.contentId,
    ...(existing?.metaHash || document.metaHash
      ? { metaHash: existing?.metaHash ?? document.metaHash }
      : {}),
    type:
      existing?.type === 'notebook'
        ? noteTypeFor(annotation)
        : (existing?.type ?? noteTypeFor(annotation)),
    cfi,
    ...(annotation.locator.locations.position
      ? { page: annotation.locator.locations.position }
      : existing?.page
        ? { page: existing.page }
        : {}),
    ...(annotation.sourceText !== undefined
      ? { text: annotation.sourceText }
      : existing?.text !== undefined
        ? { text: existing.text }
        : {}),
    note: annotation.body ?? '',
    createdAt: existing?.createdAt ?? annotation.createdAt.getTime(),
    updatedAt: annotation.updatedAt.getTime(),
    ...(annotation.deletedAt !== undefined
      ? { deletedAt: annotation.deletedAt === null ? null : annotation.deletedAt.getTime() }
      : existing?.deletedAt !== undefined
        ? { deletedAt: existing.deletedAt }
        : {}),
  };
  if (anchorChanged) {
    delete note.xpointer0;
    delete note.xpointer1;
  }
  return note;
};

export class ReadestAnnotationAdapter implements AnnotationRepositoryPort {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly loadDocument: ReadestAnnotationDocumentLoader) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async listByContent(
    contentId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<readonly Annotation[]> {
    const document = await this.loadDocument(contentId);
    if (!document) return [];
    return document.notes
      .filter(
        (note) =>
          note.type !== 'notebook' && (options.includeDeleted === true || !note.deletedAt),
      )
      .map((note) => toDomainAnnotation(note, document))
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
      );
  }

  save(annotation: Annotation): Promise<void> {
    return this.enqueue(async () => {
      const document = await this.loadDocument(annotation.contentId);
      if (!document) throw new Error(`Content "${annotation.contentId}" is not available`);
      const notes = [...document.notes];
      const index = notes.findIndex((note) => note.id === annotation.id);
      const existing = index >= 0 ? notes[index] : undefined;
      if (existing?.type === 'notebook') {
        throw new Error('The Readest notebook document cannot be replaced by an Annotation');
      }
      const saved = mergeBookNote(annotation, document, existing);
      if (index >= 0) notes[index] = saved;
      else notes.push(saved);
      await document.replace(notes);
    });
  }

  delete(contentId: string, id: string, deletedAt = new Date()): Promise<void> {
    return this.enqueue(async () => {
      const document = await this.loadDocument(contentId);
      if (!document) throw new Error(`Content "${contentId}" is not available`);
      const notes = [...document.notes];
      const index = notes.findIndex((note) => note.id === id && note.type !== 'notebook');
      if (index < 0 || notes[index]?.deletedAt) return;
      notes[index] = {
        ...notes[index]!,
        updatedAt: deletedAt.getTime(),
        deletedAt: deletedAt.getTime(),
      };
      await document.replace(notes);
    });
  }
}

const normalizeBookNotes = (notes: readonly BookNote[]): BookNote[] =>
  Array.from(
    new Map(
      notes
        .filter((note) => note.cfi)
        .map((note) => [`${note.id}-${note.type}-${note.cfi}`, note]),
    ).values(),
  );

export const createReadestAnnotationDocumentLoader = (
  appService: AppService,
): ReadestAnnotationDocumentLoader => {
  return async (contentId) => {
    const openData = useBookDataStore.getState().getBookData(contentId);
    const book = openData?.book ?? useLibraryStore.getState().getBookByHash(contentId);
    if (!book) return null;
    const settings = useSettingsStore.getState().settings;
    const config = openData?.config ?? (await appService.loadBookConfig(book, settings));
    const contentVersionId = getReadestContentVersionId(contentId);
    return {
      contentId,
      contentVersionId,
      ...(config.metaHash || book.metaHash ? { metaHash: config.metaHash ?? book.metaHash } : {}),
      notes: config.booknotes ?? [],
      replace: async (notes) => {
        const normalized = normalizeBookNotes(notes);
        const store = useBookDataStore.getState();
        const liveData = store.getBookData(contentId);
        const liveConfig = liveData?.config;
        const updatedAt = Date.now();
        const nextConfig = liveConfig
          ? store.updateBooknotes(contentId, normalized)
          : { ...config, booknotes: normalized, updatedAt };
        if (!nextConfig) throw new Error(`Content "${contentId}" is not available`);
        await appService.saveBookConfig(book, nextConfig, useSettingsStore.getState().settings);
      },
    };
  };
};
