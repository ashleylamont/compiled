# @compiled/vanilla

Compile-time CSS-in-JS without a React dependency, powered by [Compiled](https://compiledcssinjs.com).

Targets non-React environments such as ProseMirror `toDOM` functions, Web Components, and plain DOM manipulation.

## Installation

```bash
yarn add @compiled/vanilla
```

Requires `@compiled/babel-plugin` in your Babel config.

## APIs

### `cssMap(variants)`

Defines a map of CSS variants compiled to atomic class names at build time.

```typescript
import { cssMap, classNames } from '@compiled/vanilla';

const styles = cssMap({
  base: { color: 'black', margin: 0 },
  done: { color: 'white', background: 'green' },
});

// In ProseMirror toDOM:
export function toDOM(node: Node) {
  return ['div', { class: classNames([styles.base, node.attrs.done && styles.done]) }, 0];
}
```

### `classNames(array)`

Merges class names from `cssMap` variant references. Replaced with `ax()` at build time.

### `globalStylesheet(blocks)`

Defines non-atomic CSS blocks for descendant selectors that cannot be expressed atomically.

```typescript
import { globalStylesheet } from '@compiled/vanilla';

export const styles = globalStylesheet({
  tableCell: {
    '.pm-table-cell': { padding: '8px' },
    '.pm-table-cell .code-block': { fontFamily: 'monospace' },
  },
});

// Usage: <div class={styles.tableCell}>...</div>
```

### `cssFragment(styles)`

Defines a reusable style recipe. Produces no CSS on its own — inlined at consumption sites.

```typescript
import { cssFragment, globalStylesheet } from '@compiled/vanilla';

const baseCell = cssFragment({ '.pm-table-cell': { padding: '8px' } });

export const styles = globalStylesheet({
  tableCell: [baseCell, { '.pm-table-cell': { border: '1px solid' } }],
});
```

## License

Apache 2.0
