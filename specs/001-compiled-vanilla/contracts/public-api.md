# Public API Contract: @compiled/vanilla

**Branch**: `001-compiled-vanilla` | **Date**: 2026-03-04

## Package Exports

```typescript
// @compiled/runtime (new shared package)
export { ax } from './ax';
export { ac } from './ac';
export { isServerEnvironment } from './is-server-environment';
export { createCache } from './cache';
export { getDepth } from './shorthand';
export { createStylisRule } from './sheet';
export { cssCustomPropertyValue } from './css-custom-property';

// @compiled/vanilla
export { cssMap } from './css-map';
export { classNames } from './class-names';
export { globalStylesheet } from './global-stylesheet';
export { cssFragment } from './css-fragment';

// @compiled/vanilla/runtime (re-exports + vanilla-specific)
export { ax } from '@compiled/runtime';
export { injectGlobalStyles } from './inject-global';
```

## API Signatures

### `cssMap<V extends string>(styles: Record<V, CSSProperties>): Record<V, string>`

Defines a map of named style variants. Each variant key maps to a CSS
properties object. Returns a typed record where each key maps to a string of
atomic class names (after Babel transformation).

**Constraints**:

- Must be module-level (same as `@compiled/react` `cssMap`)
- All values must be statically evaluable
- Supports nested selectors, pseudo-classes, pseudo-elements, at-rules
- `token()` calls treated as static

**Runtime behaviour**: Throws if called without Babel transformation.

### `classNames(classes: Array<string | false | null | undefined>): string`

Merges an array of class name strings (from `cssMap` variants) into a single
string with atomic group deduplication. Supports conditional expressions.

**Constraints**:

- Arguments should reference `cssMap` variant values
- Conditional expressions (ternaries, logical AND) are supported

**Build-time transformation**: Replaced with `ax()` call (imported from
`@compiled/runtime`). CSS for all referenced variants is extracted.

**Runtime behaviour**: Throws if called without Babel transformation.

### `globalStylesheet<K extends string>(styles: Record<K, Record<string, CSSProperties>>): Record<K, string>`

Defines a map of named CSS rule blocks with nested selectors. Returns a typed
record where each key maps to a unique scoping class name string.

**Constraints**:

- MUST be a module-level declaration
- All values must be statically evaluable
- Top-level keys define independently-toggleable style blocks
- Values may contain nested selectors, pseudo-elements, at-rules

**Build-time transformation**:

- Dev: replaced with map literal + `injectGlobalStyles()` calls
- Production (with strip-runtime): replaced with map literal + `.global.css` import

**Runtime behaviour**: Throws if called without Babel transformation.

### `cssFragment(styles: CSSProperties): CSSProperties`

Marks a style object as a reusable fragment for cross-file composition.
Produces no CSS on its own.

**Constraints**:

- All values must be statically evaluable
- Only meaningful when composed into `globalStylesheet`, `cssMap`, or `css()`
  via array syntax under a selector key
- Circular references produce compile-time error

**Build-time transformation**: Resolved and inlined at consumption sites.
The `cssFragment` call itself is removed.

**Runtime behaviour**: Throws if called without Babel transformation.

## Build Output Contracts

### Atomic CSS (from `cssMap`/`classNames`)

- Class name format: `_{group}{value}` (e.g., `_1wyb1fwx`)
- Same format as `@compiled/react` — Principle VII applies
- Extracted to `.compiled.css` via `babel-plugin-strip-runtime`

### Global CSS (from `globalStylesheet`)

- Class name format: `gs_{hash}` (e.g., `gs_abc123`)
- Hash derived from `filePath + keyName`
- Extracted to `.global.css` via `babel-plugin-strip-runtime`
- CSS rules scoped under the generated class name:
  ```css
  .gs_abc123 .pm-table-cell {
    padding: 8px;
  }
  ```

### Dev-Mode Injection

- Atomic styles: injected via `sheet.ts` from `@compiled/runtime` (shared with `@compiled/react`)
- Global styles: injected via `injectGlobalStyles()` from `@compiled/vanilla/runtime` (`<style>` tag, plain DOM)
- SSR/Node: no-op (no `document` available)

## TypeScript Types

```typescript
// CSSProperties — matches @compiled/react's CSS type system
interface CSSProperties {
  [property: string]:
    | string
    | number
    | CSSProperties // nested selectors
    | CSSProperties[] // array composition (fragments + inline)
    | undefined;
}

// Return types are branded to prevent misuse
type CompiledAtomicStyles = string & { __compiled_atomic: true };
type CompiledGlobalClassName = string & { __compiled_global: true };
```

## Compatibility

- `@compiled/vanilla` and `@compiled/react` MUST be able to coexist in the same project/file
- Both depend on `@compiled/runtime` for shared utilities (`ax`, `ac`, `sheet`, etc.)
- Atomic class names from both packages use the same format and are deduplicated
- The Babel plugin handles both import sources independently in the same file
- `sideEffects` declaration required: `["**/*.compiled.css", "**/*.global.css"]`
