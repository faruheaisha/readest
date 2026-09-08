import { describe, expect, it, vi } from 'vitest';
import { ReadestDictionaryProviderAdapter } from '@/learning/adapters';
import type { SelectionContext } from '@/learning/domain';
import type { DictionaryProvider } from '@/services/dictionaries/types';

const selection: SelectionContext = {
  contentId: 'book-1',
  contentVersionId: 'book-1-v1',
  text: 'Running',
  language: 'en',
  locator: { href: 'chapter.xhtml', locations: { progression: 0.2 } },
};

describe('Readest dictionary learning adapter', () => {
  it('reuses enabled Readest providers and preserves a portable text fallback', async () => {
    const lookup = vi.fn(async (word: string, { container }: { container: HTMLElement }) => {
      if (word !== 'running') return { ok: false, reason: 'empty' } as const;
      const heading = document.createElement('h2');
      heading.textContent = 'run';
      const definition = document.createElement('p');
      definition.textContent = 'Move quickly on foot.';
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = '.entry { color: red; }';
      const example = document.createElement('p');
      example.textContent = 'She runs every morning.';
      shadow.append(style, example);
      container.append(heading, definition, host);
      return { ok: true, headword: 'run', sourceLabel: 'Test Dictionary' } as const;
    });
    const provider: DictionaryProvider = {
      id: 'test:dictionary',
      kind: 'builtin',
      label: 'Test',
      lookup,
    };
    const adapter = new ReadestDictionaryProviderAdapter(() => [provider]);

    const artifact = await adapter.lookup(selection);

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(artifact).toMatchObject({
      actionId: 'dictionary.lookup',
      kind: 'dictionary',
      language: 'en',
      provider: { id: 'readest.dictionary', model: 'test:dictionary' },
    });
    expect(artifact.content).toContain('Test Dictionary — run');
    expect(artifact.content).toContain('Move quickly on foot.');
    expect(artifact.content).toContain('She runs every morning.');
    expect(artifact.content).not.toContain('color: red');
  });

  it('isolates one failed provider when another returns a definition', async () => {
    const failed: DictionaryProvider = {
      id: 'failed',
      kind: 'builtin',
      label: 'Failed',
      lookup: async () => {
        throw new Error('offline');
      },
    };
    const available: DictionaryProvider = {
      id: 'available',
      kind: 'builtin',
      label: 'Available',
      lookup: async (_word, { container }) => {
        container.textContent = 'A useful definition.';
        return { ok: true };
      },
    };
    const adapter = new ReadestDictionaryProviderAdapter(() => [failed, available]);

    await expect(adapter.lookup(selection)).resolves.toMatchObject({
      content: expect.stringContaining('A useful definition.'),
    });
  });
});
