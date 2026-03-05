# Feature Specification: @compiled/vanilla Package

**Feature Branch**: `001-compiled-vanilla`
**Created**: 2026-03-04
**Status**: Draft
**Input**: Spike `@compiled/vanilla` package based on APIs proposed in the Editor Compiled CSS Migration Investigation & Analysis

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Atomic Styles in Non-React DOM (Priority: P1)

A library author building a ProseMirror editor plugin needs to apply self-contained styles to DOM nodes constructed via `toDOM` functions. They have no React render tree — only plain DOM elements. They want to use Compiled's atomic CSS system for deduplication and small bundle sizes, but `@compiled/react` requires React as a peer dependency.

The author imports `cssMap` and `classNames` from `@compiled/vanilla`, defines styles as a map of variants, and applies them as class name strings in `toDOM` return values. At build time, the Babel plugin extracts the CSS to atomic rules and replaces `classNames([styles.base, condition && styles.variant])` with `ax([styles.base, condition && styles.variant])` — the CSS extraction is static, but variant selection supports dynamic conditions at runtime via `ax()`.

**Why this priority**: This is the foundational API that validates the core concept — Compiled without React. It reuses the most existing infrastructure (`cssMap` semantics, atomic CSS pipeline) and delivers immediate value for the ~200+ `toDOM` implementations in the editor.

**Independent Test**: Can be fully tested by creating a `cssMap` definition in a `.ts` file with no React imports, running the Babel plugin, and verifying that (a) atomic CSS is extracted and (b) `classNames()` resolves to a string of atomic class names at build time.

**Acceptance Scenarios**:

1. **Given** a module importing `cssMap` and `classNames` from `@compiled/vanilla`, **When** the Babel plugin processes the file, **Then** all `cssMap` style values are extracted to atomic CSS rules and `classNames()` calls are replaced with `ax()` calls that reconcile class names at runtime.
2. **Given** a `cssMap` definition using `token()` calls (CSS custom property references), **When** built, **Then** token calls resolve to `var(--ds-...)` custom properties in the extracted CSS.
3. **Given** a `toDOM` function returning `['p', { class: classNames([styles.base, state === 'DONE' && styles.done]) }, 0]`, **When** built, **Then** the output contains an `ax()` call for runtime class reconciliation and the CSS for both `base` and `done` variants is statically extracted.
4. **Given** two separate modules defining `cssMap` with identical CSS declarations, **When** both are included in a bundle, **Then** the atomic CSS is deduplicated (same declaration produces same class name).

---

### User Story 2 — Global/Non-Atomic Extracted CSS (Priority: P1)

A plugin author maintaining table styles for a WYSIWYG editor needs to apply unscoped CSS rules using descendant selectors (e.g., `.pm-table-cell .code-block`). These styles target DOM managed by ProseMirror, outside React's render tree. Currently they use Emotion's `<Global>` component, which injects styles at runtime.

The author imports `globalStylesheet` from `@compiled/vanilla`, defines a map of named style blocks with nested selectors, and exports the result. At build time, the Babel plugin extracts the CSS to a `.global.css` file and replaces the call with a map of keys to hashed class name strings. The consumer applies class names to a wrapper element to activate style blocks.

**Why this priority**: This addresses the most critical migration blocker — the 7 `<Global>` component files and the 49 EditorContentContainer style files that rely on descendant selectors. Without this, no complete Emotion removal is possible.

**Independent Test**: Can be fully tested by defining a `globalStylesheet` call, running the Babel plugin, and verifying that (a) a `.global.css` file is emitted with correctly scoped rules and (b) the source module is transformed to export a map of string class names.

**Acceptance Scenarios**:

1. **Given** a module with `export const styles = globalStylesheet({ tableCell: { '.pm-table-cell': { padding: 8 } } })`, **When** built, **Then** a `.global.css` file is emitted containing `.gs_<hash> .pm-table-cell { padding: 8px; }` and the module exports `{ tableCell: 'gs_<hash>' }`.
2. **Given** a `globalStylesheet` with multiple top-level keys, **When** built, **Then** each key gets a unique hashed class name, enabling per-key toggling at the consumption site.
3. **Given** a `globalStylesheet` using nested selectors, pseudo-elements (`::before`, `::after`), and `token()` calls, **When** built, **Then** all are correctly represented in the extracted CSS.
4. **Given** a `globalStylesheet` call inside a function body (not module-level), **When** built, **Then** the Babel plugin emits a compile-time error indicating that `globalStylesheet` must be a module-level declaration.
5. **Given** a `globalStylesheet` containing a runtime variable reference, **When** built, **Then** the Babel plugin emits a compile-time error indicating that all values must be statically evaluable.

---

### User Story 3 — Reusable Style Fragments with Array Composition (Priority: P2)

A developer maintaining shared selection styles (box-shadow, blanket overlay, hidden native selection) needs to reuse these style recipes across multiple `globalStylesheet` definitions in different files. With Emotion, they export `css()` objects and compose them via arrays inside nested selectors. They need an equivalent pattern that works at build time.

The developer imports `cssFragment` from `@compiled/vanilla`, defines a reusable style object, and exports it. At consumption sites, the fragment is referenced inside array values under selector keys in `globalStylesheet` or `cssMap` calls. The Babel plugin resolves the fragment import, deep-merges array elements at build time, and produces the final CSS as if all properties had been written inline.

**Why this priority**: This unlocks the migration of ~30 composition sites across the editor codebase. Without it, developers would need to manually inline all shared styles, losing DRY principles and making the migration error-prone.

**Independent Test**: Can be fully tested by defining a `cssFragment` in one file, importing it into a `globalStylesheet` in another file, running the Babel plugin, and verifying that the fragment's properties appear in the extracted CSS output.

**Acceptance Scenarios**:

1. **Given** a `cssFragment` defining `{ boxShadow: '...', borderColor: 'transparent' }` and a `globalStylesheet` composing it via `[boxShadowFragment, { position: 'relative' }]` under a selector key, **When** built, **Then** the extracted CSS contains both the fragment's properties and the inline properties under that selector.
2. **Given** two `cssFragment` values that both define `'&::before'` with different properties, **When** composed in the same array, **Then** the Babel plugin deep-merges both `'&::before'` blocks (no silent overwrite).
3. **Given** a `cssFragment` imported from a different file, **When** used in a `globalStylesheet`, **Then** the Babel plugin follows the import chain, resolves the fragment, and inlines its properties at build time.
4. **Given** a `cssFragment` used outside an array context (e.g., as a standalone call with no consumer), **When** built, **Then** no CSS is emitted for the fragment itself (it only produces output when composed).
5. **Given** a `cssFragment` containing a runtime variable, **When** built, **Then** the Babel plugin emits a compile-time error.

---

### User Story 4 — Feature-Flag-Gated Style Variants (Priority: P2)

An editor developer needs to ship two variants of a style block — one for the current experience and one behind a feature flag. Both variants must be extracted at build time, and the active variant is selected at runtime by toggling which class name is applied to the wrapper element.

The developer defines both variants as separate keys in a `globalStylesheet` call. At the consumption site, they use a conditional expression to choose which class name to apply: `fg('experiment') ? styles.newVariant : styles.oldVariant`.

**Why this priority**: Feature flag gating is pervasive in the editor codebase. Every migrated style file will need this capability. It's a natural extension of User Story 2 and validates the per-key class name design.

**Independent Test**: Can be tested by defining a `globalStylesheet` with two keys, conditionally applying one, and verifying that (a) both CSS blocks are in the extracted stylesheet and (b) only the applied class name activates its styles.

**Acceptance Scenarios**:

1. **Given** a `globalStylesheet` with keys `legacy` and `experiment`, **When** built, **Then** both produce separate CSS blocks in the `.global.css` file with distinct hashed class names.
2. **Given** `className={fg('flag') ? styles.experiment : styles.legacy}` at the consumption site, **When** the flag is on, **Then** only the experiment styles are visually active (the legacy CSS exists but its class is not applied).

---

### User Story 5 — Package Usable Without React (Priority: P1)

A library author wants to use `@compiled/vanilla` in a project that does not depend on React. The package must install and function without React as a peer or runtime dependency.

**Why this priority**: This is the fundamental contract of the `vanilla` package — it exists specifically to decouple Compiled from React. If React is required, the package has no reason to exist.

**Independent Test**: Can be tested by creating a project with no React dependency, installing `@compiled/vanilla`, and verifying that (a) no peer dependency warnings for React appear and (b) all APIs function correctly after Babel transformation.

**Acceptance Scenarios**:

1. **Given** a project with `@compiled/vanilla` installed and no React dependency, **When** `npm install` / `yarn install` runs, **Then** no peer dependency warnings for React are emitted.
2. **Given** a TypeScript file importing from `@compiled/vanilla`, **When** compiled with `tsc`, **Then** type checking succeeds without React type definitions.

---

### Edge Cases

- What happens when a `cssFragment` is circularly referenced (Fragment A includes Fragment B which includes Fragment A)? The Babel plugin MUST detect the cycle and emit a compile-time error.
- What happens when a `globalStylesheet` key name collides with another `globalStylesheet` in a different file? The hashed class names MUST be unique per-file (the hash should incorporate the file path).
- What happens when `classNames()` is called with a `cssMap` variant that doesn't exist? TypeScript types MUST prevent this at compile time; the Babel plugin MUST emit an error if it encounters an unresolvable variant.
- How does the system handle CSS `@container` queries inside `globalStylesheet`? They MUST be passed through to the extracted CSS without transformation, same as `@media` queries.
- What happens when `globalStylesheet` is used in a file that also imports from `@compiled/react`? Both MUST coexist — the Babel plugin handles each import source independently.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST provide a new `@compiled/vanilla` npm package with no React peer dependency.
- **FR-002**: The package MUST export `cssMap`, `classNames`, `globalStylesheet`, and `cssFragment` APIs.
- **FR-003**: `cssMap` MUST accept the same style object shape as `@compiled/react`'s `cssMap` (nested selectors, pseudo-classes, pseudo-elements, at-rules, `token()` calls).
- **FR-004**: `classNames` MUST accept an array of `cssMap` variant references (including conditional expressions such as ternaries and logical AND). At build time, the Babel plugin extracts the CSS and replaces `classNames()` with `ax()` from `@compiled/runtime` for runtime class name reconciliation. The CSS is static; the variant selection is dynamic.
- **FR-005**: `globalStylesheet` MUST accept a map of named style blocks, each containing CSS rules with nested selectors, and produce non-atomic CSS extracted to a `.global.css` file.
- **FR-006**: `globalStylesheet` MUST return a map of top-level keys to unique hashed class name strings.
- **FR-007**: `cssFragment` MUST accept a style object and act as a build-time-only marker — producing no CSS output on its own.
- **FR-008**: `cssFragment` values MUST be composable via arrays inside selector keys of `globalStylesheet` and `cssMap` calls (from `@compiled/vanilla`). When used with `@compiled/react`'s `css()`, the same composition pattern SHOULD work, but this is validated as a follow-up — not in spike scope.
- **FR-009**: When multiple `cssFragment` values and inline style objects appear in an array, the Babel plugin MUST deep-merge them. For overlapping nested selectors (e.g., two fragments both defining `'&::before'`), properties from all fragments are combined. For the same flat CSS property under the same selector, last-in-array wins (matching JS object spread semantics).
- **FR-010**: All APIs MUST require statically evaluable values — runtime variables, function parameters, and dynamic expressions MUST cause a compile-time error.
- **FR-011**: The Babel plugin (`@compiled/babel-plugin`) MUST be extended to recognise `@compiled/vanilla` as an import source and apply the appropriate transformations.
- **FR-012**: `globalStylesheet` calls MUST be module-level declarations (not inside functions, conditionals, or loops). Violations MUST produce a compile-time error.
- **FR-013**: The Babel plugin MUST detect circular `cssFragment` references and emit a compile-time error.
- **FR-014**: The extracted `.global.css` files MUST be compatible with the existing `@compiled/babel-plugin-strip-runtime` extraction pipeline.
- **FR-015**: All APIs MUST have TypeScript type definitions that enforce correct usage at compile time (e.g., `classNames` only accepts `cssMap` variant references, not arbitrary strings).
- **FR-016**: `@compiled/vanilla` MUST work with existing bundler integrations (Webpack loader, Parcel transformer) without requiring changes to those packages — or any required changes MUST be identified and scoped.
- **FR-017**: The `ax()` runtime utility used by the transformed `classNames()` output MUST be available without a React dependency. The React-free runtime utilities (`ax`, `ac`, `is-server-environment`, `cache`, `shorthand`, `sheet`) MUST be extracted to a new `@compiled/runtime` shared package. Both `@compiled/react` and `@compiled/vanilla` MUST depend on `@compiled/runtime` for these utilities.
- **FR-018**: `globalStylesheet` MUST support two CSS delivery modes: (a) **production extraction** — CSS extracted to `.global.css` files via the strip-runtime plugin, and (b) **development injection** — CSS injected at runtime via plain DOM APIs (`<style>` tag insertion) without requiring React. The Babel plugin output MUST include a runtime injection call for dev mode that is removed during extraction.
- **FR-019**: The dev-mode injection mechanism MUST work in browser environments only. It MUST NOT throw in Node/SSR environments (it should no-op gracefully).

### Key Entities

- **Style Map** (`cssMap`): A named mapping of variant keys to atomic style definitions. Each variant resolves to a set of atomic class names at build time.
- **Class Name String** (`classNames`): A build-time marker that triggers CSS extraction and is replaced by the Babel plugin with an `ax()` call for runtime class name reconciliation. Accepts conditional expressions for dynamic variant selection.
- **Global Stylesheet** (`globalStylesheet`): A named mapping of style block keys to non-atomic CSS rule sets. Each key resolves to a unique scoping class name. CSS is extracted to a separate `.global.css` file.
- **Style Fragment** (`cssFragment`): A reusable, build-time-only style object that produces no CSS on its own. It is inlined and deep-merged at every consumption site during Babel transformation.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All four APIs (`cssMap`, `classNames`, `globalStylesheet`, `cssFragment`) pass their acceptance scenarios as verified by Babel plugin snapshot tests.
- **SC-002**: A test project using `@compiled/vanilla` with zero React dependencies installs, builds, and produces correct CSS output without errors or warnings.
- **SC-003**: A representative EditorContentContainer-style migration (exported style objects with nested selectors, cross-file fragment composition, feature-flag-gated variants) successfully compiles using only `@compiled/vanilla` APIs.
- **SC-004**: `cssFragment` deep-merge correctly handles the 4 most-reused editor selection style fragments (`boxShadowSelectionStyles`, `blanketSelectionStyles`, `borderSelectionStyles`, `hideNativeBrowserTextSelectionStyles`) composed in nested selectors with overlapping `::before`/`::after` pseudo-elements.
- **SC-005**: Extracted `.global.css` files are correctly consumed by the existing Webpack and Parcel build pipelines without additional configuration beyond `sideEffects` declarations.
- **SC-006**: Build-time error messages for invalid usage (runtime variables, non-module-level declarations, circular fragments) are clear, actionable, and include file/line information.

## Clarifications

### Session 2026-03-04

- Q: Should `classNames` resolve purely at build time to a static string, or support dynamic variant selection at runtime? → A: Per the approved Non-React proposal, `classNames` is a build-time marker replaced by the Babel plugin with `ax()` for runtime class reconciliation. CSS extraction is static; variant selection (conditionals, logical AND) is dynamic.
- Q: Where should the `ax()` runtime utility live, given `@compiled/vanilla` must not depend on React? → A: Extract `ax()` to a shared package (e.g., `@compiled/runtime`) if the implementation is identical across `react` and `vanilla`. If the vanilla version needs to work differently, a small amount of duplication in `@compiled/vanilla` is acceptable.
- Q: Should `globalStylesheet` include a dev-mode runtime injection mechanism, or is extraction-only sufficient for the spike? → A: Include a lightweight runtime injection fallback for dev mode using plain DOM APIs (inject `<style>` tags). Extraction-only would require reconfiguring dev server build pipelines in consuming projects (e.g., Confluence), which is impractical for testing. Both dev injection and production extraction should be covered upfront.
- Q: When two `cssFragment` values in an array define the same CSS property under the same selector, which wins? → A: Last-in-array wins, matching JavaScript object spread semantics (`{ ...a, ...b }` — `b` overrides `a`). This is consistent with Emotion's array composition and the standard CSS cascade mental model.

## Assumptions

- The `@compiled/vanilla` package will live in the existing monorepo under `packages/vanilla/`.
- The Babel plugin will be extended (not forked) to handle the new import source.
- `token()` calls from `@atlaskit/tokens` are treated as statically evaluable (they resolve to CSS custom property references at build time).
- The `classNames` function in `@compiled/vanilla` is a build-time marker that the Babel plugin replaces with `ax()` for runtime class reconciliation. CSS is extracted statically; variant selection (including conditionals) is resolved at runtime by `ax()`. The React-free runtime utilities (`ax`, `ac`, `sheet`, `is-server-environment`, `cache`, `shorthand`) are extracted to `@compiled/runtime`, which both `@compiled/react` and `@compiled/vanilla` depend on.
- The existing `resolveBinding` and `evaluateExpression` infrastructure in the Babel plugin is sufficient for cross-file `cssFragment` resolution.
- This specification covers the spike/proof-of-concept scope. Production hardening (performance optimisation, comprehensive edge-case handling, documentation) will be addressed in follow-up specifications.

## Dependencies

- `@compiled/runtime` — New shared package; React-free runtime utilities (`ax`, `ac`, `sheet`, etc.) extracted from `@compiled/react`.
- `@compiled/babel-plugin` — Must be extended to recognise `@compiled/vanilla` imports.
- `@compiled/css` — The atomic CSS transformation pipeline is reused for `cssMap`/`classNames`.
- `@compiled/babel-plugin-strip-runtime` — Must handle `.global.css` extraction (may need extension).
- Existing approved proposals: Non-React Support (approved), `generateStylesheet` / Global CSS API (approved, COMMIT-14873).

## References

- [Editor Compiled CSS Migration Investigation & Analysis](https://hello.atlassian.net/wiki/spaces/~712020e6f24689f2da470b80ba6873df7b44a2/pages/6552030909)
- [Non-React Support for Compiled (@compiled/vanilla) — Approved Proposal](https://hello.atlassian.net/wiki/spaces/EDITOR/pages/4524933783)
- [COMMIT-14873 — generateStylesheet / Global CSS API](https://hello.jira.atlassian.cloud/browse/COMMIT-14873)
