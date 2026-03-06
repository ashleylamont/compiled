/**
 * Mock Babel plugin that simulates @atlaskit/tokens/babel-plugin.
 *
 * Transforms `token(name, fallback)` calls into `"var(--ds-${kebab(name)}, ${fallback})"`.
 * Used in tests to verify the resolveModuleTransforms option.
 */
module.exports = function mockTokenPlugin() {
  const t = require('@babel/types');

  function kebab(str) {
    return str.replace(/\./g, '-');
  }

  return {
    visitor: {
      Program: {
        enter(path) {
          path.traverse({
            CallExpression(callPath) {
              const callee = callPath.node.callee;
              if (!t.isIdentifier(callee) || callee.name !== 'token') {
                return;
              }

              // Check that the binding comes from @atlaskit/tokens
              const binding = callPath.scope.getBinding(callee.name);
              if (
                !binding ||
                !t.isImportSpecifier(binding.path.node) ||
                !t.isImportDeclaration(binding.path.parent) ||
                binding.path.parent.source.value !== '@atlaskit/tokens'
              ) {
                return;
              }

              const args = callPath.node.arguments;
              if (args.length < 1 || !t.isStringLiteral(args[0])) {
                return;
              }

              const tokenName = args[0].value;
              const cssVar = `--ds-${kebab(tokenName)}`;

              let replacementNode;
              if (args.length >= 2 && t.isStringLiteral(args[1])) {
                replacementNode = t.stringLiteral(`var(${cssVar}, ${args[1].value})`);
              } else {
                replacementNode = t.stringLiteral(`var(${cssVar})`);
              }

              callPath.replaceWith(replacementNode);
            },
          });
        },
        exit(path) {
          // Remove unused @atlaskit/tokens imports
          path.traverse({
            ImportDeclaration(importPath) {
              if (importPath.node.source.value !== '@atlaskit/tokens') {
                return;
              }
              importPath.get('specifiers').forEach((specifier) => {
                if (!specifier.isImportSpecifier()) return;
                const localName = specifier.node.local.name;
                const binding = importPath.scope.bindings[localName];
                if (binding && !binding.referenced) {
                  specifier.remove();
                }
              });
              if (importPath.get('specifiers').length === 0) {
                importPath.remove();
              }
            },
          });
        },
      },
    },
  };
};
