import type { NodePath } from '@babel/core';
import * as t from '@babel/types';
import { hash } from '@compiled/utils';

import { visitCssFragmentPath } from '../css-fragment';
import type { Metadata } from '../types';
import { buildCodeFrameError } from '../utils/ast';
import { buildCss, getItemCss } from '../utils/css-builders';
import { deepMergeStyles } from '../utils/deep-merge-styles';
import { evaluateExpression } from '../utils/evaluate-expression';
import { resolveBinding } from '../utils/resolve-binding';

const VANILLA_RUNTIME_MODULE = '@compiled/vanilla/runtime';

/**
 * Adds a named import from `@compiled/vanilla/runtime` to the program,
 * if not already present.
 */
const ensureVanillaRuntimeImport = (
  programPath: NodePath<t.Program>,
  importedName: string
): void => {
  const body = programPath.get('body');

  const existing = body.find(
    (p): p is NodePath<t.ImportDeclaration> =>
      t.isImportDeclaration(p.node) && p.node.source.value === VANILLA_RUNTIME_MODULE
  );

  if (existing) {
    const hasIt = existing.node.specifiers.some(
      (s) =>
        t.isImportSpecifier(s) &&
        t.isIdentifier(s.imported) &&
        s.imported.name === importedName &&
        t.isIdentifier(s.local) &&
        s.local.name === importedName
    );
    if (!hasIt) {
      (existing as NodePath<t.ImportDeclaration>).pushContainer(
        'specifiers',
        t.importSpecifier(t.identifier(importedName), t.identifier(importedName))
      );
    }
  } else {
    programPath.unshiftContainer(
      'body',
      t.importDeclaration(
        [t.importSpecifier(t.identifier(importedName), t.identifier(importedName))],
        t.stringLiteral(VANILLA_RUNTIME_MODULE)
      )
    );
  }
};

/**
 * Walks an expression and pre-visits any identifier bindings whose init is still
 * an un-transformed cssFragment() CallExpression, transforming them in-place before
 * buildCss runs. This handles the case where cssFragment is defined after the
 * globalStylesheet call in source order (or cross-file).
 */
const preResolveCssFragments = (expr: t.Expression, meta: Metadata): void => {
  const collectIdentifiers = (node: t.Node): string[] => {
    if (t.isIdentifier(node)) return [node.name];
    if (t.isArrayExpression(node)) {
      return (node.elements ?? []).flatMap((el) => (el ? collectIdentifiers(el) : []));
    }
    if (t.isObjectExpression(node)) {
      return node.properties.flatMap((p) =>
        t.isObjectProperty(p) ? collectIdentifiers(p.value) : []
      );
    }
    return [];
  };

  for (const name of collectIdentifiers(expr)) {
    const binding = meta.parentPath.scope.getBinding(name);
    if (!binding || !t.isVariableDeclarator(binding.path.node)) continue;
    const init = binding.path.node.init;
    if (!init || !t.isCallExpression(init)) continue;

    // Check if this is an un-transformed cssFragment() call
    const callee = init.callee;
    const isCssFragment =
      t.isIdentifier(callee) && meta.state.compiledImports?.cssFragment?.includes(callee.name);
    if (!isCssFragment) continue;

    // Get the NodePath for the cssFragment CallExpression and visit it
    const initPath = binding.path.get('init');
    const initPathResolved = Array.isArray(initPath) ? initPath[0] : initPath;
    if (initPathResolved && t.isCallExpression(initPathResolved.node)) {
      visitCssFragmentPath(initPathResolved as NodePath<t.CallExpression>, {
        context: 'root',
        state: meta.state,
        parentPath: binding.path,
      });
    }
  }
};

/**
 * Transforms a `globalStylesheet()` call expression into:
 * 1. An object literal mapping key names to scoping class names.
 * 2. A series of `injectGlobalStyles(css, className)` calls inserted after the declaration.
 *
 * Uses the existing buildCss() pipeline so that token(), cssFragment references,
 * identifiers, and all other expression types are resolved correctly — exactly
 * the same way as cssMap and css() handle them.
 */
export const visitGlobalStylesheetPath = (
  path: NodePath<t.CallExpression> | NodePath<t.TaggedTemplateExpression>,
  meta: Metadata
): void => {
  // Tagged template expressions are not supported
  if (t.isTaggedTemplateExpression(path.node)) {
    throw buildCodeFrameError(
      'globalStylesheet() must be called at the module level',
      path.node,
      meta.parentPath
    );
  }

  const callNode = path.node as t.CallExpression;

  // Must be directly inside a VariableDeclarator at module scope
  if (!t.isVariableDeclarator(path.parent) || !t.isIdentifier(path.parent.id)) {
    throw buildCodeFrameError(
      'globalStylesheet() must be called at the module level',
      callNode,
      meta.parentPath
    );
  }

  const varDeclaratorPath = path.parentPath;
  const varDeclarationPath = varDeclaratorPath?.parentPath;
  if (!varDeclarationPath) {
    throw buildCodeFrameError(
      'globalStylesheet() must be called at the module level',
      callNode,
      meta.parentPath
    );
  }

  const varDeclParent = varDeclarationPath.parent;
  const isAtModuleScope =
    t.isProgram(varDeclParent) ||
    t.isExportNamedDeclaration(varDeclParent) ||
    t.isExportDefaultDeclaration(varDeclParent);

  if (!isAtModuleScope) {
    throw buildCodeFrameError(
      'globalStylesheet() must be called at the module level',
      callNode,
      meta.parentPath
    );
  }

  // Must have exactly one argument
  if (callNode.arguments.length !== 1) {
    throw buildCodeFrameError(
      'globalStylesheet() requires exactly one object argument',
      callNode,
      meta.parentPath
    );
  }

  const arg = callNode.arguments[0];
  if (!t.isObjectExpression(arg)) {
    throw buildCodeFrameError(
      'globalStylesheet() argument must be an object expression',
      callNode,
      meta.parentPath
    );
  }

  const filename = meta.state.filename ?? 'unknown';

  const injectCalls: t.ExpressionStatement[] = [];
  const injectGlobalStylesLocalName = 'injectGlobalStyles';
  const replacementProperties: t.ObjectProperty[] = [];

  for (const property of arg.properties) {
    if (!t.isObjectProperty(property)) {
      throw buildCodeFrameError(
        'globalStylesheet() values must be statically evaluable',
        callNode,
        meta.parentPath
      );
    }

    // Get the key name
    let keyName: string;
    if (t.isIdentifier(property.key)) {
      keyName = property.key.name;
    } else if (t.isStringLiteral(property.key)) {
      keyName = property.key.value;
    } else {
      throw buildCodeFrameError(
        'globalStylesheet() values must be statically evaluable',
        callNode,
        meta.parentPath
      );
    }

    // Generate scoping class name: gs_ + first 7 chars of hash(filename + keyName)
    const scopingClass = `gs_${hash(filename + keyName).slice(0, 7)}`;

    // Pre-resolve any cssFragment() bindings referenced in this property value
    // that haven't been visited yet (e.g. defined after this globalStylesheet call in source).
    // buildCss resolves identifier bindings, but if the init is still a cssFragment()
    // CallExpression it can't handle it — so we visit those fragments first.
    preResolveCssFragments(property.value as t.Expression, meta);

    // The property value is expected to be either:
    // A) An object where top-level keys are CSS selectors (e.g. '.ProseMirror [data-decision-wrapper]')
    //    and values are style objects or arrays for composition
    // B) An array at the variant level for composition (e.g. [cssFragmentRef, { '.child': { ... } }])
    //    where each element contains selector→style mappings
    //
    // We CANNOT pass the entire object to buildCss() because buildCss treats object
    // keys as CSS property names and kebab-cases them. Selectors like `.ProseMirror`
    // would become `.-prose-mirror` — garbled CSS.
    //
    // Instead, we resolve arrays via deep-merge first, then iterate selector keys
    // manually, and only call buildCss() on the leaf-level declaration objects.
    let selectorObj = property.value as t.Expression;

    // Handle variant-level array composition: [cssFragmentRef, { '.child': { ... } }]
    if (t.isArrayExpression(selectorObj)) {
      selectorObj = resolveArrayToMergedObject(selectorObj, meta, callNode);
    }

    if (!t.isObjectExpression(selectorObj)) {
      throw buildCodeFrameError(
        'globalStylesheet() variant values must be object expressions mapping selectors to style objects',
        callNode,
        meta.parentPath
      );
    }

    const cssLines: string[] = [];
    const allVariables: {
      name: string;
      expression: t.Expression;
      prefix?: string;
      suffix?: string;
    }[] = [];

    for (const selectorProp of selectorObj.properties) {
      if (!t.isObjectProperty(selectorProp)) {
        throw buildCodeFrameError(
          'globalStylesheet() values must be statically evaluable',
          callNode,
          meta.parentPath
        );
      }

      // Get the selector key — pass through as-is, NO kebab-casing
      let selector: string;
      if (t.isIdentifier(selectorProp.key)) {
        selector = selectorProp.key.name;
      } else if (t.isStringLiteral(selectorProp.key)) {
        selector = selectorProp.key.value;
      } else {
        throw buildCodeFrameError(
          'globalStylesheet() selector keys must be string literals or identifiers',
          callNode,
          meta.parentPath
        );
      }

      // Resolve the value: may be an object or an array (for composition)
      let resolvedValueExpr: t.Expression = selectorProp.value as t.Expression;

      if (t.isArrayExpression(resolvedValueExpr)) {
        // Array composition: [cssFragmentRef, { backgroundColor: 'yellow' }]
        resolvedValueExpr = resolveArrayToMergedObject(resolvedValueExpr, meta, callNode);
      }

      // Now resolvedValueExpr should be an ObjectExpression with CSS declarations.
      // Use replaceExternalCallExpressions + buildCss on this leaf object.
      const replacements = replaceExternalCallExpressions(resolvedValueExpr, meta);

      let cssOutput;
      try {
        cssOutput = buildCss(resolvedValueExpr, meta);
      } catch (e: any) {
        restoreExternalCallExpressions(replacements);
        throw buildCodeFrameError(
          `globalStylesheet() values must be statically evaluable: ${e.message}`,
          callNode,
          meta.parentPath
        );
      }

      // Restore the original call expressions and patch any CSS variables
      restoreExternalCallExpressions(replacements);
      for (const variable of cssOutput.variables) {
        const replacement = replacements.find(
          (r) => r.placeholderName === (variable.expression as t.Identifier).name
        );
        if (replacement) {
          variable.expression = replacement.original;
        }
      }

      // Collect CSS variables for injectGlobalCssVariables
      allVariables.push(...cssOutput.variables);

      // Collect CSS declarations and wrap them in the selector rule
      for (const item of cssOutput.css) {
        if (item.type === 'unconditional' || item.type === 'sheet') {
          const raw = getItemCss(item).trim();
          if (!raw) continue;
          // raw is CSS declarations like `padding:8px;color:red;`
          // Wrap in: `.gs_xxx selector{declarations}`
          // Strip trailing semicolons for clean output
          const minified = minifyCss(raw).replace(/;$/, '');
          cssLines.push(`.${scopingClass} ${selector}{${minified}}`);
        } else if (item.type === 'logical' || item.type === 'conditional') {
          throw buildCodeFrameError(
            'globalStylesheet() values must be statically evaluable — conditional expressions are not supported',
            callNode,
            meta.parentPath
          );
        }
      }
    }

    // Emit injectGlobalCssVariables if any CSS variables were produced
    if (allVariables.length > 0) {
      const variableProperties = allVariables.map((variable) => {
        let valueExpr: t.Expression = variable.expression;
        if (variable.suffix || variable.prefix) {
          const quasis: t.TemplateElement[] = [
            t.templateElement({ raw: variable.prefix ?? '', cooked: variable.prefix ?? '' }),
            t.templateElement({ raw: variable.suffix ?? '', cooked: variable.suffix ?? '' }, true),
          ];
          valueExpr = t.templateLiteral(quasis, [variable.expression]);
        }
        return t.objectProperty(t.stringLiteral(variable.name), valueExpr);
      });

      injectCalls.push(
        t.expressionStatement(
          t.callExpression(t.identifier('injectGlobalCssVariables'), [
            t.stringLiteral(scopingClass),
            t.objectExpression(variableProperties),
          ])
        )
      );
    }

    const cssString = cssLines.join('');

    replacementProperties.push(
      t.objectProperty(t.identifier(keyName), t.stringLiteral(scopingClass))
    );

    injectCalls.push(
      t.expressionStatement(
        t.callExpression(t.identifier(injectGlobalStylesLocalName), [
          t.stringLiteral(cssString),
          t.stringLiteral(scopingClass),
        ])
      )
    );
  }

  // Replace the call expression with the object literal
  path.replaceWith(t.objectExpression(replacementProperties));

  // Insert inject calls after the statement
  const insertionPath = t.isExportNamedDeclaration(varDeclParent)
    ? varDeclarationPath.parentPath!
    : varDeclarationPath;

  for (let i = injectCalls.length - 1; i >= 0; i--) {
    insertionPath.insertAfter(injectCalls[i]);
  }

  // Ensure the imports are present
  const programPath = insertionPath.findParent((p) =>
    t.isProgram(p.node)
  ) as NodePath<t.Program> | null;

  if (programPath) {
    ensureVanillaRuntimeImport(programPath, injectGlobalStylesLocalName);
    // If any CSS variables were emitted, also ensure injectGlobalCssVariables is imported
    const hasVariables = injectCalls.some(
      (call) =>
        t.isCallExpression(call.expression) &&
        t.isIdentifier(call.expression.callee) &&
        call.expression.callee.name === 'injectGlobalCssVariables'
    );
    if (hasVariables) {
      ensureVanillaRuntimeImport(programPath, 'injectGlobalCssVariables');
    }
  }
};

interface CallExprReplacement {
  /** The parent ObjectProperty node containing the replaced value */
  parent: t.ObjectProperty;
  /** The original CallExpression node */
  original: t.CallExpression;
  /** The placeholder identifier name used as the replacement */
  placeholderName: string;
}

/**
 * Walks an ObjectExpression and replaces any CallExpression property values
 * whose callee is an identifier imported from an external (non-compiled) module
 * with a unique placeholder Identifier. This prevents buildCss from trying to
 * resolve the import (which would fail for modules like @atlaskit/tokens that
 * aren't available at compile time).
 *
 * Returns an array of replacements so they can be restored afterward.
 */
const replaceExternalCallExpressions = (
  expr: t.Expression,
  meta: Metadata
): CallExprReplacement[] => {
  const replacements: CallExprReplacement[] = [];
  let counter = 0;

  const walk = (node: t.Node): void => {
    if (t.isObjectExpression(node)) {
      for (const prop of node.properties) {
        if (t.isObjectProperty(prop)) {
          if (t.isCallExpression(prop.value)) {
            const callee = prop.value.callee;
            if (t.isIdentifier(callee)) {
              // Check if the callee is imported from an external module
              const binding = meta.parentPath.scope.getBinding(callee.name);
              if (binding && t.isImportDeclaration(binding.path.parent)) {
                const source = binding.path.parent.source.value;
                // Skip compiled imports — buildCss knows how to handle those
                const compiledSources = meta.state.opts.importSources ?? [
                  '@compiled/react',
                  '@compiled/vanilla',
                  '@atlaskit/css',
                ];
                if (!compiledSources.includes(source)) {
                  const placeholderName = `__compiled_gs_placeholder_${counter++}__`;
                  replacements.push({
                    parent: prop,
                    original: prop.value,
                    placeholderName,
                  });
                  prop.value = t.identifier(placeholderName);
                }
              }
            }
          } else {
            // Recurse into nested objects / arrays
            walk(prop.value);
          }
        }
      }
    } else if (t.isArrayExpression(node)) {
      for (const elem of node.elements) {
        if (elem) walk(elem);
      }
    }
  };

  walk(expr);
  return replacements;
};

/**
 * Restores call expressions that were replaced by replaceExternalCallExpressions.
 */
const restoreExternalCallExpressions = (replacements: CallExprReplacement[]): void => {
  for (const { parent, original } of replacements) {
    parent.value = original;
  }
};

/**
 * Minifies a CSS string by removing unnecessary whitespace.
 * Produces compact output like `color:red;font-size:12px` suitable for injectGlobalStyles.
 */
const minifyCss = (css: string): string =>
  css
    .replace(/\s*{\s*/g, '{')
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*;\s*/g, ';')
    .replace(/;\s*}/g, '}')
    .trim();

/**
 * Resolves an identifier to an ObjectExpression, handling both same-file bindings
 * (where cssFragment has already been transformed to a plain object) and cross-file
 * imports (where the resolved node may still be a cssFragment() CallExpression).
 *
 * Returns the ObjectExpression or null if the identifier can't be resolved.
 */
const resolveIdentifierToObjectExpression = (
  name: string,
  meta: Metadata
): t.ObjectExpression | null => {
  // 1. Try same-file binding (cssFragment already transformed to ObjectExpression)
  const binding = meta.parentPath.scope.getBinding(name);
  if (binding && t.isVariableDeclarator(binding.path.node)) {
    const init = binding.path.node.init;
    if (init && t.isObjectExpression(init)) {
      return init;
    }
  }

  // 2. Try cross-file resolution via resolveBinding
  const resolved = resolveBinding(name, meta, evaluateExpression);
  if (resolved && t.isExpression(resolved.node)) {
    const node = resolved.node;

    // Direct ObjectExpression (plain exported object)
    if (t.isObjectExpression(node)) {
      return node;
    }

    // cssFragment() CallExpression from another file — unwrap it
    if (t.isCallExpression(node)) {
      const callee = node.callee;
      // Check if this looks like a cssFragment() call
      const isCssFragment =
        t.isIdentifier(callee) &&
        (meta.state.compiledImports?.cssFragment?.includes(callee.name) ||
          callee.name === 'cssFragment');
      if (isCssFragment && node.arguments.length === 1 && t.isObjectExpression(node.arguments[0])) {
        return node.arguments[0] as t.ObjectExpression;
      }
    }
  }

  return null;
};

/**
 * Resolves an array of expressions (ObjectExpressions and identifier references)
 * into a single deep-merged ObjectExpression AST node.
 *
 * Used for array composition: [cssFragmentRef, { backgroundColor: 'yellow' }]
 */
const resolveArrayToMergedObject = (
  arrayExpr: t.ArrayExpression,
  meta: Metadata,
  callNode: t.CallExpression
): t.ObjectExpression => {
  const styleObjects: Record<string, unknown>[] = [];

  for (const element of arrayExpr.elements) {
    if (!element || !t.isExpression(element)) {
      throw buildCodeFrameError(
        'globalStylesheet() array elements must be expressions',
        callNode,
        meta.parentPath
      );
    }

    let objExpr: t.ObjectExpression | null = null;

    if (t.isObjectExpression(element)) {
      objExpr = element;
    } else if (t.isIdentifier(element)) {
      objExpr = resolveIdentifierToObjectExpression(element.name, meta);
      if (!objExpr) {
        throw buildCodeFrameError(
          `globalStylesheet() could not resolve identifier '${element.name}' to a style object. ` +
            'Ensure it is a cssFragment() or a plain object literal.',
          callNode,
          meta.parentPath
        );
      }
    } else {
      throw buildCodeFrameError(
        'globalStylesheet() array elements must be object expressions or cssFragment references',
        callNode,
        meta.parentPath
      );
    }

    const evaluated = evaluateObjectExpressionStatic(objExpr);
    if (evaluated === null) {
      throw buildCodeFrameError(
        'globalStylesheet() array elements must be statically evaluable style objects',
        callNode,
        meta.parentPath
      );
    }
    styleObjects.push(evaluated);
  }

  const merged = deepMergeStyles(styleObjects);
  return plainObjectToAst(merged);
};

/**
 * Statically evaluates an ObjectExpression AST node into a plain JS object.
 * Only supports string/number literals as values (nested objects allowed).
 * Returns null if any value cannot be statically determined.
 */
const evaluateObjectExpressionStatic = (
  node: t.ObjectExpression
): Record<string, unknown> | null => {
  const result: Record<string, unknown> = {};

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) return null;

    let keyName: string;
    if (t.isIdentifier(prop.key)) {
      keyName = prop.key.name;
    } else if (t.isStringLiteral(prop.key)) {
      keyName = prop.key.value;
    } else {
      return null;
    }

    if (t.isObjectExpression(prop.value)) {
      const nested = evaluateObjectExpressionStatic(prop.value);
      if (nested === null) return null;
      result[keyName] = nested;
    } else if (t.isStringLiteral(prop.value)) {
      result[keyName] = prop.value.value;
    } else if (t.isNumericLiteral(prop.value)) {
      result[keyName] = prop.value.value;
    } else {
      return null;
    }
  }

  return result;
};

/**
 * Converts a plain JS object back to an ObjectExpression AST node.
 */
const plainObjectToAst = (obj: Record<string, unknown>): t.ObjectExpression => {
  const properties: t.ObjectProperty[] = [];

  for (const [key, value] of Object.entries(obj)) {
    let valueNode: t.Expression;
    if (typeof value === 'string') {
      valueNode = t.stringLiteral(value);
    } else if (typeof value === 'number') {
      valueNode = t.numericLiteral(value);
    } else if (typeof value === 'object' && value !== null) {
      valueNode = plainObjectToAst(value as Record<string, unknown>);
    } else {
      continue;
    }
    properties.push(t.objectProperty(t.identifier(key), valueNode));
  }

  return t.objectExpression(properties);
};
