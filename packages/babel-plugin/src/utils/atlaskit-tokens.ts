import fs from 'fs';
import { dirname, join } from 'path';

import { parse } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { DEFAULT_PARSER_BABEL_PLUGINS } from '@compiled/utils';
import resolve from 'resolve';

import { DEFAULT_CODE_EXTENSIONS } from '../constants';
import type { Metadata } from '../types';

import { getPathOfNode } from './ast';
import type { EvaluateExpression } from './types';

const ATLASKIT_TOKENS_BABEL_PLUGIN = '@atlaskit/tokens/babel-plugin';
const TOKEN_NAMES_REQUEST = '@atlaskit/tokens/token-names';
const TOKEN_DEFAULT_VALUES_REQUEST = '@atlaskit/tokens/token-default-values';

type AtlaskitTokensTransformOptions = {
  shouldUseAutoFallback?: boolean;
  shouldForceAutoFallback?: boolean;
  forceAutoFallbackExemptions?: string[];
};

type StaticTokenMap = Record<string, string>;

export const isAtlaskitTokensTransform = (pluginPath: string): boolean =>
  pluginPath === ATLASKIT_TOKENS_BABEL_PLUGIN ||
  pluginPath.endsWith(`/@atlaskit/tokens/babel-plugin`) ||
  pluginPath.endsWith(`\\@atlaskit\\tokens\\babel-plugin`);

const getAtlaskitTokensTransformOptions = (
  meta: Metadata
): AtlaskitTokensTransformOptions | undefined => {
  const entry = meta.state.opts.resolveModuleTransforms?.find((pluginEntry) => {
    const pluginPath = Array.isArray(pluginEntry) ? pluginEntry[0] : pluginEntry;
    return isAtlaskitTokensTransform(pluginPath);
  });

  if (!entry) {
    return undefined;
  }

  return Array.isArray(entry) ? (entry[1] as AtlaskitTokensTransformOptions | undefined) ?? {} : {};
};

const resolveRequest = (contextFilename: string, request: string, meta: Metadata): string => {
  const resolver = (
    meta.state as Metadata['state'] & {
      resolver?: { resolveSync(context: string, request: string): string };
    }
  ).resolver;

  if (resolver) {
    return resolver.resolveSync(contextFilename, request);
  }

  const id = request.charAt(0) === '.' ? join(dirname(contextFilename), request) : request;

  return resolve.sync(id, {
    basedir: dirname(contextFilename),
    extensions: meta.state.opts.extensions ?? DEFAULT_CODE_EXTENSIONS,
  });
};

const getModuleAst = (modulePath: string, meta: Metadata) => {
  const moduleCode = meta.state.cache.load({
    cacheKey: modulePath,
    namespace: 'atlaskit-tokens-module-code',
    value: () => fs.readFileSync(modulePath, 'utf8'),
  });

  return meta.state.cache.load({
    cacheKey: modulePath,
    namespace: 'atlaskit-tokens-module-ast',
    value: () =>
      parse(moduleCode, {
        sourceType: 'module',
        plugins: meta.state.opts.parserBabelPlugins ?? DEFAULT_PARSER_BABEL_PLUGINS,
      }),
  });
};

const unwrapObjectExpression = (
  node: t.Node | null | undefined
): t.ObjectExpression | undefined => {
  if (!node) {
    return undefined;
  }

  if (t.isObjectExpression(node)) {
    return node;
  }

  if (t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node) || t.isTypeCastExpression(node)) {
    return unwrapObjectExpression(node.expression);
  }

  if (t.isParenthesizedExpression(node)) {
    return unwrapObjectExpression(node.expression);
  }

  return undefined;
};

const objectExpressionToMap = (node: t.ObjectExpression): StaticTokenMap => {
  const result: StaticTokenMap = {};

  node.properties.forEach((property) => {
    if (!t.isObjectProperty(property) || property.computed) {
      return;
    }

    const key = t.isStringLiteral(property.key)
      ? property.key.value
      : t.isIdentifier(property.key)
      ? property.key.name
      : undefined;

    if (!key) {
      return;
    }

    if (t.isStringLiteral(property.value)) {
      result[key] = property.value.value;
      return;
    }

    if (t.isNumericLiteral(property.value)) {
      result[key] = String(property.value.value);
    }
  });

  return result;
};

const findTopLevelVariable = (name: string, program: t.Program): t.ObjectExpression | undefined => {
  for (const statement of program.body) {
    if (!t.isVariableDeclaration(statement)) {
      continue;
    }

    for (const declaration of statement.declarations) {
      if (t.isIdentifier(declaration.id, { name }) && declaration.init) {
        const objectExpression = unwrapObjectExpression(declaration.init);
        if (objectExpression) {
          return objectExpression;
        }
      }
    }
  }

  return undefined;
};

const getDefaultExportObjectExpression = (
  modulePath: string,
  meta: Metadata,
  seen: Set<string> = new Set()
): t.ObjectExpression => {
  if (seen.has(modulePath)) {
    throw new Error(
      `Circular Atlaskit tokens metadata export detected while resolving ${modulePath}`
    );
  }

  const ast = getModuleAst(modulePath, meta);
  const nextSeen = new Set(seen);
  nextSeen.add(modulePath);

  for (const statement of ast.program.body) {
    if (t.isExportDefaultDeclaration(statement)) {
      const declaration = statement.declaration;

      if (t.isObjectExpression(declaration)) {
        return declaration;
      }

      if (t.isIdentifier(declaration)) {
        const resolved = findTopLevelVariable(declaration.name, ast.program);
        if (resolved) {
          return resolved;
        }
      }
    }

    if (t.isExportNamedDeclaration(statement) && statement.source) {
      const reexportsDefault = statement.specifiers.some(
        (specifier) =>
          t.isExportSpecifier(specifier) &&
          t.isIdentifier(specifier.exported, { name: 'default' }) &&
          t.isIdentifier(specifier.local, { name: 'default' })
      );

      if (reexportsDefault) {
        return getDefaultExportObjectExpression(
          resolveRequest(modulePath, statement.source.value, meta),
          meta,
          nextSeen
        );
      }
    }
  }

  throw new Error(`Unable to resolve default export object for ${modulePath}`);
};

const loadStaticTokenMap = (request: string, meta: Metadata): StaticTokenMap => {
  const contextFilename = meta.state.filename;

  if (!contextFilename) {
    throw new Error(
      `Unable to resolve ${request} due to a missing filename, this is probably a bug!`
    );
  }

  const modulePath = resolveRequest(contextFilename, request, meta);

  return meta.state.cache.load({
    cacheKey: modulePath,
    namespace: 'atlaskit-tokens-static-map',
    value: () => objectExpressionToMap(getDefaultExportObjectExpression(modulePath, meta)),
  });
};

const isExempted = (tokenName: string, exemptions: string[] = []): boolean =>
  exemptions.some((exemption) => tokenName.startsWith(exemption));

export const isTokenImportBinding = (path: NodePath<t.CallExpression>): boolean => {
  const callee = path.get('callee');
  if (!callee.isIdentifier()) {
    return false;
  }

  const binding = path.scope.getBinding(callee.node.name);
  if (!binding || !binding.path.parentPath?.isImportDeclaration()) {
    return false;
  }

  if (binding.path.parentPath.node.source.value !== '@atlaskit/tokens') {
    return false;
  }

  if (binding.path.isImportSpecifier()) {
    return t.isIdentifier(binding.path.node.imported, { name: 'token' });
  }

  return binding.path.isImportDefaultSpecifier();
};

const buildTokenTemplateLiteral = (
  cssTokenValue: string,
  fallback: t.Expression
): t.TemplateLiteral =>
  t.templateLiteral(
    [
      t.templateElement(
        {
          cooked: `var(${cssTokenValue}, `,
          raw: `var(${cssTokenValue.replace(/\\|`|\$\{/g, '\\$&')}, `,
        },
        false
      ),
      t.templateElement({ cooked: ')', raw: ')' }, true),
    ],
    [fallback]
  );

export const lowerAtlaskitTokenCallPath = (
  path: NodePath<t.CallExpression>,
  meta: Metadata,
  evaluateExpression: EvaluateExpression
): t.Expression | undefined => {
  const tokenTransformOptions = getAtlaskitTokensTransformOptions(meta);

  if (!tokenTransformOptions || !isTokenImportBinding(path)) {
    return undefined;
  }

  const expression = path.node;

  if (!expression.arguments[0]) {
    throw new Error(`token() requires at least one argument`);
  }

  if (!t.isStringLiteral(expression.arguments[0])) {
    throw new Error(`token() must have a string literal as the first argument`);
  }

  if (expression.arguments.length > 2) {
    throw new Error(`token() does not accept ${expression.arguments.length} arguments`);
  }

  const tokenName = expression.arguments[0].value;
  const tokenNames = loadStaticTokenMap(TOKEN_NAMES_REQUEST, meta);
  const tokenDefaultValues = loadStaticTokenMap(TOKEN_DEFAULT_VALUES_REQUEST, meta);
  const cssTokenValue = tokenNames[tokenName];

  if (!cssTokenValue) {
    throw new Error(`token '${tokenName}' does not exist`);
  }

  const defaultFallback = tokenDefaultValues[tokenName];
  const forceAutoFallbackExemptions = [
    'radius',
    ...(tokenTransformOptions.forceAutoFallbackExemptions || []),
  ];

  if (expression.arguments.length < 2) {
    if (tokenTransformOptions.shouldUseAutoFallback !== false) {
      return t.stringLiteral(`var(${cssTokenValue}, ${defaultFallback})`);
    }

    return t.stringLiteral(`var(${cssTokenValue})`);
  }

  const originalFallback = expression.arguments[1];
  const evaluatedFallback =
    originalFallback && t.isExpression(originalFallback)
      ? evaluateExpression(originalFallback, meta).value
      : originalFallback;

  const fallback =
    tokenTransformOptions.shouldForceAutoFallback !== false &&
    !isExempted(tokenName, forceAutoFallbackExemptions)
      ? t.stringLiteral(defaultFallback)
      : evaluatedFallback;

  if (t.isStringLiteral(fallback)) {
    return t.stringLiteral(
      fallback.value ? `var(${cssTokenValue}, ${fallback.value})` : `var(${cssTokenValue})`
    );
  }

  if (fallback && t.isExpression(fallback)) {
    return buildTokenTemplateLiteral(cssTokenValue, fallback);
  }

  return t.stringLiteral(`var(${cssTokenValue})`);
};

export const lowerAtlaskitTokenCall = (
  expression: t.CallExpression,
  meta: Metadata,
  evaluateExpression: EvaluateExpression
): t.Expression | undefined => {
  const path = getPathOfNode(expression, meta.parentPath);
  return path.isCallExpression()
    ? lowerAtlaskitTokenCallPath(path, meta, evaluateExpression)
    : undefined;
};
