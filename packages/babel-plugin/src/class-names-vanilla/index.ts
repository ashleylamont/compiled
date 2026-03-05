import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

import type { Metadata } from '../types';
import { buildCodeFrameError } from '../utils/ast';

/**
 * Takes a `classNames([...])` call expression and replaces it with `ax([...])`.
 *
 * For example:
 * ```
 * const cls = classNames([styles.base, isDone && styles.done]);
 * ```
 * gets transformed to
 * ```
 * const cls = ax([styles.base, isDone && styles.done]);
 * ```
 *
 * @param path {NodePath} The path to be evaluated.
 * @param meta {Metadata} Useful metadata that can be used during the transformation
 */
export const visitVanillaClassNamesPath = (
  path: NodePath<t.CallExpression> | NodePath<t.TaggedTemplateExpression>,
  meta: Metadata
): void => {
  // We don't support tagged template expressions.
  if (t.isTaggedTemplateExpression(path.node)) {
    throw buildCodeFrameError(
      'classNames() must be called as a function, not as a tagged template expression.',
      path.node,
      meta.parentPath
    );
  }

  const callPath = path as NodePath<t.CallExpression>;

  // classNames() must receive exactly one argument.
  if (callPath.node.arguments.length !== 1) {
    throw buildCodeFrameError(
      'classNames() must receive exactly one argument.',
      callPath.node,
      meta.parentPath
    );
  }

  const arg = callPath.node.arguments[0];

  // The argument must be an array expression.
  if (!t.isArrayExpression(arg)) {
    throw buildCodeFrameError(
      'classNames() argument must be an array expression, e.g. classNames([styles.base, isDone && styles.done]).',
      callPath.node,
      meta.parentPath
    );
  }

  // Replace classNames([...]) with ax([...])
  callPath.replaceWith(t.callExpression(t.identifier('ax'), [arg]));

  // ax is injected by appendRuntimeImports on Program exit, which is triggered
  // by the presence of state.compiledImports (already set when classNames was detected).
};
