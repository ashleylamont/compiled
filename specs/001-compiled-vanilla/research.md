# Research: @compiled/vanilla Package

**Branch**: `001-compiled-vanilla` | **Date**: 2026-03-04

## R-1: Can `ax()` be extracted without React?

**Decision**: Yes — `ax()` has zero imports and zero React dependencies.

**Rationale**: `ax()` in `packages/react/src/runtime/ax.ts` is a pure function
that maps class names by their atomic group prefix (first 5 characters). It
uses only plain JavaScript — no React, no DOM APIs, no external imports. The
algorithm: iterate class names, use `className.slice(0, 5)` as the map key for
atomic classes (those starting with `_`), keep the full name as key for
non-atomic classes, last-write wins per key, return joined values.

`ac()` in `packages/react/src/runtime/ac.ts` has one import
(`isServerEnvironment`) for memoisation gating — also React-free.

**Alternatives considered**:

- Import from `@compiled/react/runtime` subpath — rejected because
  `@compiled/react` declares React as a peer dependency, causing install
  warnings in React-free projects.
- Shared `@compiled/runtime` package — viable long-term but adds monorepo
  complexity for the spike. Deferred.

**Spike approach**: Copy `ax.ts` into `@compiled/vanilla/src/runtime/ax.ts`.
If identical after spike, extract to shared package.

## R-2: How does import source detection work?

**Decision**: Add `@compiled/vanilla` to `DEFAULT_IMPORT_SOURCES` array.

**Rationale**: The Babel plugin uses `DEFAULT_IMPORT_SOURCES` from
`packages/utils/src/constants.ts` (currently `['@compiled/react',
'@atlaskit/css']`). These are merged with user-provided `importSources` in
`babel-plugin.ts` lines 95-107. The `ImportDeclaration` visitor checks if a
source matches any entry, then stores local binding names per API
(`cssMap`, `styled`, `css`, `keyframes`).

Adding `@compiled/vanilla` to the defaults means the plugin recognises it
without configuration. The `cssMap` transform handler makes no assumptions
about which package the import came from — it only checks
`state.compiledImports.cssMap`.

**Alternatives considered**:

- User-configured `importSources` only — rejected because it adds unnecessary
  setup friction. The package is first-party.
- Separate plugin for vanilla — rejected; unnecessary duplication.

## R-3: How does `globalStylesheet` extraction integrate with strip-runtime?

**Decision**: Extend `babel-plugin-strip-runtime` to handle a new
`injectGlobalStyles()` call pattern alongside existing `CC`/`CS`.

**Rationale**: Strip-runtime currently finds `CC`/`CS` JSX elements, extracts
their `styles` arrays, and writes to `.compiled.css`. For `globalStylesheet`:

1. The main Babel plugin emits `injectGlobalStyles(cssString, className)` calls
   in the transformed output (dev mode).
2. Strip-runtime adds a visitor for `injectGlobalStyles` call expressions:
   - Extracts the CSS string argument
   - Collects into a separate `globalStyleRules` set
   - At `Program` exit: writes to `{filename}.global.css`
   - Replaces the call with `import './{filename}.global.css'`

This parallels the existing `CC`/`CS` → `.compiled.css` flow.

**Alternatives considered**:

- Write `.global.css` directly in the main Babel plugin — rejected because it
  breaks the two-phase architecture (Constitution Principle I).
- Embed global styles in `.compiled.css` alongside atomic — rejected because
  global styles have different cascade semantics and should be a separate file
  for clarity.

## R-4: Dev-mode style injection without React

**Decision**: Plain DOM `<style>` tag injection with environment detection.

**Rationale**: The existing React runtime uses `<Style>` components
(`style.tsx`) that render `<style>` elements via React. For vanilla:

```typescript
function injectGlobalStyles(css: string, nonce?: string): void {
  if (typeof document === 'undefined') return; // SSR no-op
  const style = document.createElement('style');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = css;
  document.head.appendChild(style);
}
```

For atomic styles (`classNames`/`cssMap`), the existing `sheet.ts` can be
reused — it uses DOM APIs (`document.createElement`, `insertRule`) with no
React dependency. The Babel plugin would emit `insertRule()` calls instead of
`CC`/`CS` components.

**Alternatives considered**:

- CSSStyleSheet `adoptedStyleSheets` API — not supported in all target
  browsers.
- Reuse `CC`/`CS` with optional React — rejected; contradicts the zero-React
  contract.

## R-5: `cssFragment` deep-merge algorithm

**Decision**: Recursive merge with last-in-array wins for flat properties.

**Rationale**: When composing `[fragmentA, fragmentB, { inline: 'value' }]`:

1. Iterate array left to right
2. For each element, recursively merge into accumulator:
   - String/number values: overwrite (last wins)
   - Object values (nested selectors like `'&::before'`): recurse
   - Array values (further composition): flatten and recurse
3. Result is a single merged style object

This matches JavaScript spread semantics for flat properties and provides
recursive merge for nested selectors — the key difference from plain spread
that makes `cssFragment` valuable.

The Babel plugin already has `evaluateExpression` for static evaluation of
style objects. The new logic is the merge step, implemented as a utility
function in `packages/babel-plugin/src/utils/deep-merge-styles.ts`.

**Alternatives considered**:

- Spread-only (no deep merge) — rejected; fragments with overlapping
  `'&::before'` would silently overwrite each other.
- Compile-time error on overlap — rejected; the spec explicitly requires
  deep-merge for overlapping nested selectors (FR-009).

## R-6: `globalStylesheet` class name hashing

**Decision**: Hash based on `filePath + topLevelKeyName`, prefixed with `gs_`.

**Rationale**: Each top-level key in a `globalStylesheet` call needs a unique,
deterministic class name. Using `filePath + keyName` ensures:

- Uniqueness across files (two files can have a `tableCell` key without collision)
- Determinism across builds (same input → same output)
- Debuggability (the `gs_` prefix makes it identifiable as a global stylesheet class)

The hash function reuses the existing `hash()` from `@compiled/utils`.

**Alternatives considered**:

- Content-based hash (hash the CSS content) — rejected; two different keys with
  identical CSS should still get different class names for independent toggling.
- Sequential numbering — rejected; non-deterministic across builds.
