import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

import type { Metadata } from '../types';
import { buildCodeFrameError } from '../utils/ast';

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

    let keyName: string;
    if (t.isIdentifier(prop.key)) {
      keyName = prop.key.name;
    } else if (t.isStringLiteral(prop.key)) {
      keyName = prop.key.value;
    } else {
      return null;
    }

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
 * Converts a plain JS object back to an ObjectExpression AST node.
 */
const objectToAst = (obj: Record<string, unknown>): t.ObjectExpression => {
  const properties: t.ObjectProperty[] = [];

  for (const [key, value] of Object.entries(obj)) {
    let valueNode: t.Expression;
    if (typeof value === 'string') {
      valueNode = t.stringLiteral(value);
    } else if (typeof value === 'number') {
      valueNode = t.numericLiteral(value);
    } else if (typeof value === 'object' && value !== null) {
      valueNode = objectToAst(value as Record<string, unknown>);
    } else {
      continue;
    }
    properties.push(t.objectProperty(t.stringLiteral(key), valueNode));
  }

  return t.objectExpression(properties);
};

/**
 * Transforms a `cssFragment()` call expression into a plain object literal.
 *
 * `cssFragment({ color: 'red' })` → `{ color: 'red' }`
 *
 * The fragment produces no CSS on its own — it is inlined at the consumption
 * site (globalStylesheet, cssMap) via array composition and deep-merging.
 */
export const visitCssFragmentPath = (
  path: NodePath<t.CallExpression> | NodePath<t.TaggedTemplateExpression>,
  meta: Metadata
): void => {
  // Tagged template expressions are not supported
  if (t.isTaggedTemplateExpression(path.node)) {
    throw buildCodeFrameError(
      'cssFragment() must be assigned to a module-level variable',
      path.node,
      meta.parentPath
    );
  }

  const callNode = path.node as t.CallExpression;

  // Must be directly inside a VariableDeclarator with an Identifier id
  if (!t.isVariableDeclarator(path.parent) || !t.isIdentifier(path.parent.id)) {
    throw buildCodeFrameError(
      'cssFragment() must be assigned to a module-level variable',
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
      'cssFragment() must be assigned to a module-level variable',
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
      'cssFragment() must be assigned to a module-level variable',
      callNode,
      meta.parentPath
    );
  }

  // Must have exactly one argument
  if (callNode.arguments.length !== 1) {
    throw buildCodeFrameError(
      'cssFragment() requires exactly one object argument',
      callNode,
      meta.parentPath
    );
  }

  const arg = callNode.arguments[0];
  if (!t.isObjectExpression(arg)) {
    throw buildCodeFrameError(
      'cssFragment() argument must be an object expression',
      callNode,
      meta.parentPath
    );
  }

  // Statically evaluate the argument
  const evaluated = evaluateObjectExpression(arg);
  if (evaluated === null) {
    throw buildCodeFrameError(
      'cssFragment() values must be statically evaluable',
      callNode,
      meta.parentPath
    );
  }

  // Replace cssFragment({...}) with the plain object literal
  path.replaceWith(objectToAst(evaluated));
};
