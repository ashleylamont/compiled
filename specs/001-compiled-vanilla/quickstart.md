# Quickstart: @compiled/vanilla

**Branch**: `001-compiled-vanilla` | **Date**: 2026-03-04

## Prerequisites

- Node.js (version per `.nvmrc`)
- Yarn (classic)
- This monorepo cloned and dependencies installed (`yarn install`)

## Building

```bash
# Build the full monorepo (required for cross-package dependencies)
yarn build

# Or build individual packages in dependency order:
yarn workspace @compiled/utils build
yarn workspace @compiled/css build
yarn workspace @compiled/babel-plugin build
yarn workspace @compiled/vanilla build
```

## Running Tests

```bash
# Run all vanilla package tests
yarn workspace @compiled/vanilla test

# Run specific test file
yarn workspace @compiled/vanilla test css-map.test

# Run with watch mode during development
yarn workspace @compiled/vanilla test --watch

# Run Babel plugin tests for the new handlers
yarn workspace @compiled/babel-plugin test global-stylesheet
yarn workspace @compiled/babel-plugin test css-fragment
yarn workspace @compiled/babel-plugin test class-names
```

## Development Workflow

### 1. Create a new API stub

Each API follows the same pattern:

```typescript
// packages/vanilla/src/css-map.ts
import type { CSSProperties } from './types';

type CSSMapInput<V extends string> = Record<V, CSSProperties>;

export function cssMap<V extends string>(_styles: CSSMapInput<V>): Record<V, string> {
  // Runtime stub — throws if not transformed by the Babel plugin
  throw new Error(
    '@compiled/vanilla - cssMap: This function must be compiled away. ' +
      'Ensure @compiled/babel-plugin is configured.'
  );
}
```

### 2. Add Babel plugin handler

Create a new handler directory following existing patterns:

```
packages/babel-plugin/src/global-stylesheet/
├── index.ts          # visitGlobalStylesheetPath() handler
└── __tests__/
    └── global-stylesheet.test.ts
```

Use the `transform()` test helper from `packages/babel-plugin/src/test-utils.ts`:

```typescript
import { transform } from '../../test-utils';

describe('globalStylesheet', () => {
  it('should extract CSS and return class name map', () => {
    const result = transform(`
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        tableCell: { '.pm-table-cell': { padding: 8 } },
      });
    `);
    expect(result).toMatchInlineSnapshot(`...`);
  });
});
```

### 3. Register import source

In `packages/utils/src/constants.ts`, add `@compiled/vanilla` to
`DEFAULT_IMPORT_SOURCES`.

### 4. Register handler in Babel plugin

In `packages/babel-plugin/src/babel-plugin.ts`, add detection for
`globalStylesheet`, `classNames`, and `cssFragment` API names in the
`ImportDeclaration` visitor, and route to the new handlers in the
`CallExpression` visitor.

## Usage Example (Consumer)

```typescript
// styles.ts
import { cssMap, classNames } from '@compiled/vanilla';

const styles = cssMap({
  base: { color: 'black', margin: 0 },
  done: { color: 'white', background: 'green' },
});

// In ProseMirror toDOM
export function toDOM(node: any) {
  const { state } = node.attrs;
  return [
    'div',
    {
      class: classNames([styles.base, state === 'DONE' && styles.done]),
    },
    0,
  ];
}
```

## Key Files

| File                                                   | Purpose                            |
| ------------------------------------------------------ | ---------------------------------- |
| `packages/vanilla/src/index.ts`                        | Public API exports                 |
| `packages/vanilla/package.json`                        | Package config (no React peer dep) |
| `packages/babel-plugin/src/babel-plugin.ts`            | Import detection + handler routing |
| `packages/utils/src/constants.ts`                      | `DEFAULT_IMPORT_SOURCES`           |
| `packages/babel-plugin/src/utils/deep-merge-styles.ts` | Fragment deep-merge logic          |
| `packages/babel-plugin-strip-runtime/src/index.ts`     | `.global.css` extraction           |
