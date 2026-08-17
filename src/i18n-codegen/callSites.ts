import fs from 'node:fs';
import path from 'node:path';
import type * as ts from 'typescript';

import type { CallSiteCopy, TypeScriptModule } from './types';

const DEFAULT_IGNORE_DIRS = ['__tests__', 'mock-builders'];

/**
 * Every `t()` call in the source is the catalog's source of truth.
 *
 * A prose key exists because a component asks for it and passes its English copy inline; delete the
 * call and the key is gone. That is what removes the need for a checked-in `en.json` and for an
 * extract / remove-unused-keys pass, and it makes a dead prose key structurally impossible.
 *
 * The only keys that cannot be described this way are the ones with no inline copy — a formatter
 * expression, or a key built from a runtime value. Those come from `runtimeDefaults`, and the generator
 * cross-checks the two.
 */
const isTCallee = (tsModule: TypeScriptModule, expr: ts.Expression): boolean =>
  (tsModule.isIdentifier(expr) && expr.text === 't') ||
  (tsModule.isPropertyAccessExpression(expr) && expr.name.text === 't');

export const sourceFiles = ({
  ignoreDirs = DEFAULT_IGNORE_DIRS,
  srcRoot = 'src',
}: {
  ignoreDirs?: string[];
  srcRoot?: string;
} = {}): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full);
      }
    }
  };
  walk(srcRoot);
  return out;
};

export const readCallSiteCopy = ({
  ignoreDirs,
  srcRoot,
  ts: tsModule,
}: {
  ts: TypeScriptModule;
  ignoreDirs?: string[];
  srcRoot?: string;
}): CallSiteCopy => {
  const copy = new Map<string, string>();
  const withoutCopy = new Map<string, string>();
  const conflicts: CallSiteCopy['conflicts'] = [];

  const record = (key: string, value: string, file: string) => {
    const existing = copy.get(key);
    if (existing !== undefined && existing !== value) {
      conflicts.push({ a: existing, b: value, file, key });
      return;
    }
    copy.set(key, value);
  };

  for (const file of sourceFiles({ ignoreDirs, srcRoot })) {
    const sourceFile = tsModule.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      tsModule.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? tsModule.ScriptKind.TSX : tsModule.ScriptKind.TS,
    );

    const visit = (node: ts.Node) => {
      if (tsModule.isCallExpression(node) && isTCallee(tsModule, node.expression)) {
        const [keyArg, second] = node.arguments;
        if (keyArg && tsModule.isStringLiteralLike(keyArg)) {
          const key = keyArg.text;
          if (second && tsModule.isStringLiteralLike(second)) {
            // t('key', 'Copy')
            record(key, second.text, file);
          } else if (second && tsModule.isObjectLiteralExpression(second)) {
            // t('key', { count, defaultValue_one, defaultValue_other }) — the catalog holds the
            // `_one` / `_other` forms, never the bare key.
            let plurals = 0;
            for (const prop of second.properties) {
              if (!tsModule.isPropertyAssignment(prop)) continue;
              const name = prop.name.getText(sourceFile).replace(/['"]/g, '');
              const suffix = name.match(/^defaultValue_(\w+)$/)?.[1];
              if (suffix && tsModule.isStringLiteralLike(prop.initializer)) {
                record(`${key}_${suffix}`, prop.initializer.text, file);
                plurals++;
              }
            }
            if (!plurals) withoutCopy.set(key, file);
          } else {
            // t('key') — no inline copy, so it has to resolve from runtimeDefaults.
            withoutCopy.set(key, file);
          }
        }
      }
      tsModule.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return { conflicts, copy, withoutCopy };
};
