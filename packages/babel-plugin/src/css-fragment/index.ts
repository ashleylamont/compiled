import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

import type { Metadata } from '../types';
import { buildCodeFrameError } from '../utils/ast';

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

  // Replace cssFragment({...}) with the argument ObjectExpression directly.
  // We don't need to evaluate it — just strip the cssFragment() wrapper.
  // The consuming site (globalStylesheet, cssMap) will handle evaluation
  // of any dynamic expressions like token() calls within the object.
  path.replaceWith(arg);
};
