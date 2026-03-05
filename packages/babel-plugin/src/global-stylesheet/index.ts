import type { NodePath } from '@babel/core';
import * as t from '@babel/types';
import { hash, kebabCase } from '@compiled/utils';

import type { Metadata } from '../types';
import { buildCodeFrameError } from '../utils/ast';
import { deepMergeStyles } from '../utils/deep-merge-styles';

const VANILLA_RUNTIME_MODULE = '@compiled/vanilla/runtime';

/**
 * Converts a plain JS object (from static evaluation) to a non-atomic CSS string
 * scoped under the given class name.
 *
 * The top-level keys of the style object are treated as sub-selectors.
 * E.g. { '.pm-table-cell': { padding: '8px' } } →
 *   .gs_abc1234 .pm-table-cell{padding:8px}
 */
const serializeStyles = (scopingClass: string, styleObj: Record<string, unknown>): string => {
  const parts: string[] = [];

  for (const [selector, declarations] of Object.entries(styleObj)) {
    if (typeof declarations !== 'object' || declarations === null) {
      continue;
    }

    const decls = Object.entries(declarations as Record<string, unknown>)
      .map(([prop, value]) => `${kebabCase(prop)}:${value}`)
      .join(';');

    parts.push(`.${scopingClass} ${selector}{${decls}}`);
  }

  return parts.join('');
};

/**
 * Statically evaluates an ObjectExpression node into a plain JS object.
 * Only supports string/number literals as values (nested objects allowed).
 * Returns null if any value cannot be statically determined.
 */
const evaluateObjectExpression = (node: t.ObjectExpression): Record<string, unknown> | null => {
  const result: Record<string, unknown> = {};

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) {
      return null;
    }

    // Get key name
    let keyName: string;
    if (t.isIdentifier(prop.key)) {
      keyName = prop.key.name;
    } else if (t.isStringLiteral(prop.key)) {
      keyName = prop.key.value;
    } else {
      return null;
    }

    // Get value
    if (t.isObjectExpression(prop.value)) {
      const nested = evaluateObjectExpression(prop.value);
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
 * Adds `injectGlobalStyles` import from `@compiled/vanilla/runtime` to the program,
 * if not already present.
 */
const ensureInjectGlobalStylesImport = (
  programPath: NodePath<t.Program>,
  localName: string
): void => {
  const body = programPath.get('body');

  const existing = body.find(
    (p): p is NodePath<t.ImportDeclaration> =>
      t.isImportDeclaration(p.node) && p.node.source.value === VANILLA_RUNTIME_MODULE
  );

  if (existing) {
    // Check if injectGlobalStyles is already a specifier
    const hasIt = existing.node.specifiers.some(
      (s) => t.isImportSpecifier(s) && t.isIdentifier(s.local) && s.local.name === localName
    );
    if (!hasIt) {
      (existing as NodePath<t.ImportDeclaration>).pushContainer(
        'specifiers',
        t.importSpecifier(t.identifier(localName), t.identifier('injectGlobalStyles'))
      );
    }
  } else {
    programPath.unshiftContainer(
      'body',
      t.importDeclaration(
        [t.importSpecifier(t.identifier(localName), t.identifier('injectGlobalStyles'))],
        t.stringLiteral(VANILLA_RUNTIME_MODULE)
      )
    );
  }
};

/**
 * Transforms a `globalStylesheet()` call expression into:
 * 1. An object literal mapping key names to scoping class names.
 * 2. A series of `injectGlobalStyles(css, className)` calls inserted after the declaration.
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

  // Check that we're actually at module scope:
  // VariableDeclarator → VariableDeclaration → (ExportNamedDeclaration →)? Program
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

  // Collect the inject calls we'll insert after the declaration
  const injectCalls: t.ExpressionStatement[] = [];
  const injectGlobalStylesLocalName = 'injectGlobalStyles';

  // Build the replacement object { keyName: 'gs_<hash>', ... }
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

    // Statically evaluate the property value — supports plain object or array composition
    let styleObj: Record<string, unknown> | null = null;

    if (t.isObjectExpression(property.value)) {
      styleObj = evaluateObjectExpression(property.value);
    } else if (t.isArrayExpression(property.value)) {
      // Array composition: [fragmentRef, { overrides }]
      // Each element must resolve to a plain object (already evaluated cssFragment or inline object)
      const parts: Record<string, unknown>[] = [];
      for (const element of property.value.elements) {
        if (element === null || t.isSpreadElement(element)) {
          throw buildCodeFrameError(
            'globalStylesheet() values must be statically evaluable',
            callNode,
            meta.parentPath
          );
        }
        if (t.isObjectExpression(element)) {
          const obj = evaluateObjectExpression(element);
          if (obj === null) {
            throw buildCodeFrameError(
              'globalStylesheet() values must be statically evaluable',
              callNode,
              meta.parentPath
            );
          }
          parts.push(obj);
        } else if (t.isIdentifier(element)) {
          // Resolve the binding — should be a cssFragment (already replaced with plain object)
          const binding = meta.parentPath.scope.getBinding(element.name);
          if (!binding || !t.isVariableDeclarator(binding.path.node)) {
            throw buildCodeFrameError(
              'globalStylesheet() values must be statically evaluable',
              callNode,
              meta.parentPath
            );
          }
          const init = binding.path.node.init;
          if (!init || !t.isObjectExpression(init)) {
            throw buildCodeFrameError(
              'globalStylesheet() values must be statically evaluable',
              callNode,
              meta.parentPath
            );
          }
          const obj = evaluateObjectExpression(init);
          if (obj === null) {
            throw buildCodeFrameError(
              'globalStylesheet() values must be statically evaluable',
              callNode,
              meta.parentPath
            );
          }
          parts.push(obj);
        } else {
          throw buildCodeFrameError(
            'globalStylesheet() values must be statically evaluable',
            callNode,
            meta.parentPath
          );
        }
      }
      styleObj = deepMergeStyles(parts);
    }

    if (styleObj === null) {
      throw buildCodeFrameError(
        'globalStylesheet() values must be statically evaluable',
        callNode,
        meta.parentPath
      );
    }

    const cssString = serializeStyles(scopingClass, styleObj);

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

  // Insert inject calls after the statement (VariableDeclaration or ExportNamedDeclaration)
  // The insertion point is the outermost statement at module scope
  const insertionPath = t.isExportNamedDeclaration(varDeclParent)
    ? varDeclarationPath.parentPath!
    : varDeclarationPath;

  // Insert in reverse order so they appear in original order after the declaration
  for (let i = injectCalls.length - 1; i >= 0; i--) {
    insertionPath.insertAfter(injectCalls[i]);
  }

  // Ensure the import is present
  const programPath = insertionPath.findParent((p) =>
    t.isProgram(p.node)
  ) as NodePath<t.Program> | null;

  if (programPath) {
    ensureInjectGlobalStylesImport(programPath, injectGlobalStylesLocalName);
  }
};
