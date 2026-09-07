// @vitest-environment node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src/learning');

const filesBelow = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(target) : Promise.resolve([target]);
    }),
  );
  return nested.flat().filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
};

const importsIn = async (directory: string): Promise<string[]> => {
  const files = await filesBelow(directory);
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return sources.flatMap((source) =>
    [...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/gu)].map(
      (match) => match[1] ?? '',
    ),
  );
};

describe('learning layer boundaries', () => {
  it('keeps Domain independent from frameworks, Readest, adapters, and providers', async () => {
    const imports = await importsIn(path.join(sourceRoot, 'domain'));
    expect(imports.filter((specifier) => !specifier.startsWith('.'))).toEqual([]);
    expect(imports.filter((specifier) => specifier.includes('/adapters'))).toEqual([]);
    expect(imports.filter((specifier) => specifier.includes('/application'))).toEqual([]);
  });

  it('allows Ports to depend only on Domain and contract-neutral modules', async () => {
    const imports = await importsIn(path.join(sourceRoot, 'ports'));
    expect(
      imports.filter(
        (specifier) =>
          specifier.includes('/adapters') ||
          specifier.includes('/application') ||
          specifier.includes('/kernel') ||
          specifier.startsWith('next') ||
          specifier.startsWith('react'),
      ),
    ).toEqual([]);
  });
});
