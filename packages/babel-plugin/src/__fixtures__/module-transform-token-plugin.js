module.exports = function moduleTransformTokenPlugin({ types: t }) {
  return {
    name: 'module-transform-token-plugin',
    visitor: {
      CallExpression(path) {
        if (
          t.isIdentifier(path.node.callee, { name: 'token' }) &&
          path.node.arguments.length >= 1 &&
          t.isStringLiteral(path.node.arguments[0])
        ) {
          const fallback =
            path.node.arguments.length > 1 && t.isStringLiteral(path.node.arguments[1])
              ? path.node.arguments[1].value
              : '';
          path.replaceWith(
            t.stringLiteral(
              `var(--mock-${path.node.arguments[0].value.replace(
                /[^a-zA-Z0-9-]/g,
                '-'
              )}, ${fallback})`
            )
          );
        }
      },
    },
  };
};
