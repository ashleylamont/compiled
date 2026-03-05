import type { NodePath } from '@babel/core';
import * as t from '@babel/types';
import { hash } from '@compiled/utils';

import { visitCssFragmentPath } from '../css-fragment';
import type { Metadata } from '../types';
import { buildCodeFrameError } from '../utils/ast';
import { buildCss, getItemCss } from '../utils/css-builders';

const VANILLA_RUNTIME_MODULE = '@compiled/vanilla/runtime';

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

    // Use buildCss() to evaluate the property value — this handles token(), cssFragment
    // references (via identifier resolution), arrays, nested objects, and all other
    // expression types exactly the same way as cssMap and css() do.
    //
    // The property value is expected to be an object where:
    // - top-level keys are CSS selectors (e.g. '.pm-table-cell')
    // - values are style objects (or arrays of style objects for composition)
    //
    // We call buildCss on the whole object, which gives us CssItems.
    // Each CssItem's css string is a declaration like `color: red;` already wrapped
    // in a selector rule by the toCSSRule path inside buildCss when it encounters
    // nested objects (since nested objects in the input become CSS rules).
    //
    // To get non-atomic output: we collect all unconditional CSS strings from the items
    // and join them. Dynamic values (variables) are NOT supported in globalStylesheet
    // (it must be fully static), so we throw if any CSS variables are produced.
    let cssOutput;
    try {
      cssOutput = buildCss(property.value as t.Expression, meta);
    } catch (e: any) {
      throw buildCodeFrameError(
        `globalStylesheet() values must be statically evaluable: ${e.message}`,
        callNode,
        meta.parentPath
      );
    }

    if (cssOutput.variables.length > 0) {
      throw buildCodeFrameError(
        'globalStylesheet() values must be statically evaluable — dynamic values (CSS variables) are not supported',
        callNode,
        meta.parentPath
      );
    }

    // Collect CSS strings from all unconditional items.
    // buildCss on a nested object like { '.pm-table-cell': { padding: '8px' } } produces
    // items with css like `.pm-table-cell { padding: 8px; }` (via toCSSRule).
    // We then prepend the scoping class to each rule.
    const cssLines: string[] = [];
    for (const item of cssOutput.css) {
      if (item.type === 'unconditional' || item.type === 'sheet') {
        const raw = getItemCss(item).trim();
        if (!raw) continue;
        // The raw CSS from buildCss for nested objects looks like:
        // `.pm-table-cell { padding: 8px; }`
        // We need to prepend the scoping class: `.gs_xxx .pm-table-cell { ... }`
        // But buildCss wraps in the selector as-is; we need to insert the scoping class.
        // Prepend `.${scopingClass} ` before the selector in each rule.
        const scoped = prependScopingClass(raw, scopingClass);
        if (scoped) cssLines.push(scoped);
      } else if (item.type === 'logical' || item.type === 'conditional') {
        throw buildCodeFrameError(
          'globalStylesheet() values must be statically evaluable — conditional expressions are not supported',
          callNode,
          meta.parentPath
        );
      }
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

  // Ensure the import is present
  const programPath = insertionPath.findParent((p) =>
    t.isProgram(p.node)
  ) as NodePath<t.Program> | null;

  if (programPath) {
    ensureInjectGlobalStylesImport(programPath, injectGlobalStylesLocalName);
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
 * Prepends the scoping class to each CSS rule in a raw CSS string.
 *
 * buildCss produces strings like `.pm-table-cell { padding: 8px; }` for nested
 * selector objects. We need `.gs_abc1234 .pm-table-cell { padding: 8px; }`.
 *
 * For plain declarations without a selector (shouldn't happen in globalStylesheet
 * but handled defensively), we wrap them in the scoping class directly.
 */
const prependScopingClass = (raw: string, scopingClass: string): string => {
  const trimmed = minifyCss(raw);
  if (!trimmed) return '';

  // If it already looks like a rule (contains `{`), prepend the scoping class before the selector.
  if (trimmed.includes('{')) {
    return `.${scopingClass} ${trimmed}`;
  }

  // Plain declaration — wrap in scoping class rule
  return `.${scopingClass}{${trimmed}}`;
};
