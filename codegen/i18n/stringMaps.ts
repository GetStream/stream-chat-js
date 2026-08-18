import fs from 'node:fs';
import type * as ts from 'typescript';

import type { TypeScriptModule } from './types';

/**
 * Reads a flat `Record<string, string>` export out of a source file.
 *
 * Parsed rather than imported: `await import()` works under Node's type stripping but warns
 * `MODULE_TYPELESS_PACKAGE_JSON` on every run, and the SDK packages cannot be `"type": "module"`.
 *
 * Throws rather than exiting, so a caller — including a test — can handle the failure.
 */
export const readStringMap = ({
  exportName,
  file,
  ts: tsModule,
}: {
  exportName: string;
  file: string;
  ts: TypeScriptModule;
}): Map<string, string> => {
  if (!fs.existsSync(file)) {
    throw new Error(
      `i18n-codegen: could not read the file expected to export \`${exportName}\`: ${file}`,
    );
  }

  const source = tsModule.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    tsModule.ScriptTarget.Latest,
    true,
    tsModule.ScriptKind.TS,
  );

  const out = new Map<string, string>();
  let found = false;

  tsModule.forEachChild(source, (node) => {
    if (!tsModule.isVariableStatement(node)) return;

    for (const declaration of node.declarationList.declarations) {
      if (
        !tsModule.isIdentifier(declaration.name) ||
        declaration.name.text !== exportName ||
        !declaration.initializer
      ) {
        continue;
      }

      // `= { … } as const` and `satisfies …` are both fine.
      let initializer: ts.Expression = declaration.initializer;
      while (
        tsModule.isAsExpression(initializer) ||
        tsModule.isSatisfiesExpression(initializer)
      ) {
        initializer = initializer.expression;
      }
      if (!tsModule.isObjectLiteralExpression(initializer)) continue;

      found = true;
      for (const property of initializer.properties) {
        if (!tsModule.isPropertyAssignment(property)) {
          throw new Error(
            `i18n-codegen: ${exportName} in ${file} must be a flat object of string literals, got: ` +
              property.getText(source).slice(0, 80),
          );
        }
        if (
          !tsModule.isStringLiteralLike(property.name) ||
          !tsModule.isStringLiteralLike(property.initializer)
        ) {
          throw new Error(
            `i18n-codegen: ${exportName} entries must be 'quoted.key': 'string literal', got: ` +
              property.getText(source).slice(0, 80),
          );
        }
        out.set(property.name.text, property.initializer.text);
      }
    }
  });

  if (!found) {
    throw new Error(
      `i18n-codegen: could not find an exported \`${exportName}\` object literal in ${file}`,
    );
  }

  return out;
};
