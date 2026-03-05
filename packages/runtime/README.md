# @compiled/runtime

React-free shared runtime utilities for [Compiled CSS-in-JS](https://compiledcssinjs.com).

Used internally by `@compiled/react` and `@compiled/vanilla`. Not intended to be consumed directly by application code.

## Utilities

| Export                                          | Description                                       |
| ----------------------------------------------- | ------------------------------------------------- |
| `ax(classNames)`                                | Merge atomic class names, last group wins         |
| `ac(classNames)`                                | Advanced atomic merge (chainable, memoized)       |
| `insertRule(css, opts)`                         | Insert a CSS rule into a style bucket in the DOM  |
| `isServerEnvironment()`                         | Returns `true` in Node/SSR environments           |
| `isCacheDisabled()`                             | Returns `true` when cache is disabled (test mode) |
| `getShorthandDepth(prop)`                       | Returns the shorthand depth for a CSS property    |
| `cssCustomPropertyValue(value, suffix, prefix)` | Build a CSS custom property value                 |

## License

Apache 2.0
