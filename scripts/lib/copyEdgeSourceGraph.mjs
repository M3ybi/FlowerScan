import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Copy only source dependencies of explicitly declared fixture functions.
// Never copy workspace .env, linked .temp, credentials or build directories.
export const copyEdgeSourceGraph = async (workspace, entrypoints, repository = process.cwd()) => {
  const copied = new Set();
  const copy = async filename => {
    const source = path.resolve(filename), relative = path.relative(repository, source).replaceAll('\\', '/');
    if (!/^(supabase\/functions|src)\//.test(relative) || !/\.(?:[cm]?[jt]sx?|jsonc?)$/.test(relative)
      || relative.split('/').includes('..') || path.isAbsolute(relative)) throw new Error('Unexpected disposable function dependency.');
    if (copied.has(relative)) return;
    copied.add(relative);
    const text = await readFile(source, 'utf8'), target = path.join(workspace, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    for (const imported of ts.preProcessFile(text, true, true).importedFiles) {
      if (!imported.fileName.startsWith('.')) continue;
      const resolved = ts.resolveModuleName(imported.fileName, source,
        { moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true }, ts.sys).resolvedModule;
      if (!resolved) throw new Error('Unresolved disposable function dependency.');
      await copy(resolved.resolvedFileName);
    }
  };
  for (const entrypoint of entrypoints) await copy(path.resolve(repository, entrypoint));
  return [...copied].sort();
};
