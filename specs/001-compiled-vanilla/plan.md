# Implementation Plan: @compiled/vanilla Package

**Branch**: `001-compiled-vanilla` | **Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-compiled-vanilla/spec.md`

## Summary

Spike a new `@compiled/vanilla` npm package providing four APIs — `cssMap`, `classNames`, `globalStylesheet`, and `cssFragment` — that enable compile-time CSS extraction without a React dependency. The package targets ProseMirror `toDOM` functions and global style injection for the editor Emotion→Compiled migration. The Babel plugin is extended (not forked) to recognise `@compiled/vanilla` as an import source. The `ax()` runtime utility is extracted to a shared location since it has zero React dependencies.

## Technical Context

**Language/Version**: TypeScript (strict mode), compiled via `ttsc`
**Primary Dependencies**: `@compiled/babel-plugin` (extended), `@compiled/css` (reused), `@compiled/utils` (shared constants), `@compiled/runtime` (new shared package for React-free runtime utilities)
**Storage**: N/A (build-time tool, no persistence)
**Testing**: Jest with `@compiled/jest` matchers, inline snapshot tests via `toMatchInlineSnapshot()`
**Target Platform**: Node.js (build-time Babel plugin), Browser (dev-mode style injection)
**Project Type**: Library (npm package in monorepo)
**Performance Goals**: Build-time transformation must not measurably regress existing `@compiled/babel-plugin` performance
**Constraints**: Zero React peer/runtime dependency; must coexist with `@compiled/react` in the same project
**Scale/Scope**: 4 new APIs, ~10-15 new source files in `packages/vanilla/`, ~8-10 files moved to `packages/runtime/`, ~5-10 modified files in `packages/babel-plugin/`, `@compiled/react` updated to re-export from `@compiled/runtime`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                                                                                                                                                                                           |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Compile-Time CSS Generation   | ✅ PASS | All CSS determined at build time. `globalStylesheet` extracts to `.global.css`. `cssMap`/`classNames` produce atomic CSS. Dev-mode injection is a temporary runtime bridge (same pattern as `CC`/`CS` in `@compiled/react`).    |
| II. Atomic CSS Architecture      | ✅ PASS | `cssMap`/`classNames` produce atomic CSS via existing pipeline. `globalStylesheet` intentionally produces non-atomic CSS — this is a justified deviation for descendant-selector use cases that cannot be expressed atomically. |
| III. Test-Driven Development     | ✅ PASS | All new APIs will have TDD-driven inline snapshot tests. `cssFragment` deep-merge, `globalStylesheet` extraction, and error cases all have defined acceptance scenarios.                                                        |
| IV. Bundler-Agnostic Integration | ✅ PASS | No bundler-specific code in `@compiled/vanilla`. Extraction uses the existing `babel-plugin-strip-runtime` pipeline. FR-016 requires bundler compatibility verification.                                                        |
| V. Simplicity & YAGNI            | ✅ PASS | Four APIs, each with a clear purpose documented in the spec. `cssFragment` exists only because array composition is a real pattern (~30 sites) that cannot be expressed otherwise.                                              |
| VI. Deterministic CSS Ordering   | ✅ PASS | Atomic output uses existing ordering pipeline. `globalStylesheet` preserves source order (non-atomic CSS, no reordering needed).                                                                                                |
| VII. Stable Output Contract      | ✅ PASS | Atomic class names use existing `_{group}{value}` format. `globalStylesheet` class names use a new `gs_` prefix — documented as a new contract element.                                                                         |

**Deviation justification**: `globalStylesheet` produces non-atomic CSS (Principle II). This is intentional and required — descendant selectors (`.pm-table-cell .code-block`) cannot be expressed as atomic rules. The spec, approved proposals, and Confluence analysis all identify this as a necessary capability. Tracked in Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/001-compiled-vanilla/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/runtime/
├── package.json           # No React peer dependency; shared runtime utilities
├── tsconfig.json
├── index.js               # CJS entry point
└── src/
    ├── index.ts           # Public API: ax, ac, sheet, isServerEnvironment, etc.
    ├── ax.ts              # Atomic class name merging (moved from @compiled/react)
    ├── ac.ts              # Advanced atomic class merging (moved from @compiled/react)
    ├── is-server-environment.ts  # Environment detection
    ├── cache.ts           # Cache control
    ├── shorthand.ts       # Shorthand property depth
    ├── sheet.ts           # Style bucket ordering and DOM injection
    ├── css-custom-property.ts  # CSS custom property value helper
    └── types.ts           # Bucket, StyleSheetOpts (React-free subset)

packages/vanilla/
├── package.json           # No React peer dep; depends on @compiled/runtime
├── tsconfig.json
├── tsconfig.browser.json
├── tsconfig.cjs.json
├── README.md
├── index.js               # CJS entry point
└── src/
    ├── index.ts           # Public API: cssMap, classNames, globalStylesheet, cssFragment
    ├── css-map.ts         # cssMap type definitions and runtime stub
    ├── class-names.ts     # classNames type definitions and runtime stub
    ├── global-stylesheet.ts  # globalStylesheet type definitions and runtime stub
    ├── css-fragment.ts    # cssFragment type definitions and runtime stub
    ├── types.ts           # Shared type definitions
    ├── runtime/
    │   ├── index.ts       # Re-exports from @compiled/runtime + vanilla-specific utils
    │   └── inject-global.ts  # Dev-mode global CSS injection (plain DOM, no React)
    └── __tests__/
        ├── css-map.test.ts
        ├── class-names.test.ts
        ├── global-stylesheet.test.ts
        ├── css-fragment.test.ts
        └── integration.test.ts

packages/babel-plugin/src/
├── babel-plugin.ts           # MODIFIED: add @compiled/vanilla to default import sources
├── global-stylesheet/        # NEW: globalStylesheet handler
│   ├── index.ts
│   └── __tests__/
│       └── global-stylesheet.test.ts
├── css-fragment/             # NEW: cssFragment handler
│   ├── index.ts
│   └── __tests__/
│       └── css-fragment.test.ts
├── class-names/              # NEW: classNames handler (cssMap→ax bridge)
│   ├── index.ts
│   └── __tests__/
│       └── class-names.test.ts
└── utils/
    ├── deep-merge-styles.ts  # NEW: array composition deep-merge logic
    └── __tests__/
        └── deep-merge-styles.test.ts

packages/babel-plugin-strip-runtime/src/
└── index.ts                  # MODIFIED: handle globalStylesheet extraction to .global.css
```

**Structure Decision**: New `packages/vanilla/` package following the same conventions as `packages/react/` (TypeScript, ttsc builds, CJS/ESM/browser outputs). Babel plugin changes are additive — new handler directories alongside existing `css-map/`, `styled/`, `css-prop/` handlers.

## Complexity Tracking

> **Deviation from Constitution Principle II (Atomic CSS Architecture)**

| Violation                                  | Why Needed                                                                                                                                  | Simpler Alternative Rejected Because                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `globalStylesheet` produces non-atomic CSS | Descendant selectors (`.pm-table-cell .code-block`) cannot be expressed as atomic rules. Editor has ~49 style files requiring this pattern. | Atomic-only would require restructuring all ProseMirror DOM to carry class names for every contextual override — infeasible for 200+ node types with cross-node relationships. |

## Architecture Decisions

### AD-1: Shared `@compiled/runtime` Package

**Decision**: Create a new `@compiled/runtime` package containing all React-free runtime utilities: `ax.ts`, `ac.ts`, `is-server-environment.ts`, `cache.ts`, `shorthand.ts`, `sheet.ts`, `css-custom-property.ts`, and `types.ts` (with React-specific types like `ProviderComponent` and `UseCacheHook` remaining in `@compiled/react`). Both `@compiled/react` and `@compiled/vanilla` depend on `@compiled/runtime`.

**Rationale**: Investigation confirmed all these utilities have zero React imports. `ax()` is pure string manipulation, `sheet.ts` uses only DOM APIs, `ac()` imports only `isServerEnvironment`. Extracting them to a shared package avoids duplication between `@compiled/react` and `@compiled/vanilla`, reduces the risk of divergence, and keeps the vanilla package lean. `@compiled/react` re-exports from `@compiled/runtime` to maintain backward compatibility for existing consumers importing from `@compiled/react/runtime`.

### AD-2: Import Source Registration

**Decision**: Add `@compiled/vanilla` to `DEFAULT_IMPORT_SOURCES` in `packages/utils/src/constants.ts`.

**Rationale**: The Babel plugin already merges `DEFAULT_IMPORT_SOURCES` with user-provided `importSources`. Adding `@compiled/vanilla` to the defaults means it works out of the box without configuration. The `cssMap` transform is fully reusable — it makes no assumptions about the source package.

### AD-3: `globalStylesheet` Babel Transform

**Decision**: Implement a new visitor handler (`visitGlobalStylesheetPath`) in `packages/babel-plugin/src/global-stylesheet/index.ts`. The handler:

1. Statically evaluates the style object (reusing `evaluateExpression`)
2. Serialises each top-level key's styles to a CSS string (non-atomic, preserving nested selectors)
3. Generates a unique scoping class name per key (hash of file path + key name)
4. In dev mode: replaces the call with a map literal + inline `injectGlobalStyles()` call
5. In extraction mode: `babel-plugin-strip-runtime` collects the CSS and writes to `.global.css`

**Rationale**: Follows the same handler pattern as `visitCssMapPath`, `visitStyledPath`, etc. Reuses existing static evaluation infrastructure.

### AD-4: `cssFragment` Resolution

**Decision**: Implement `cssFragment` as a new recognised call expression in the Babel plugin. When encountered at a definition site, the plugin stores the statically evaluated object. When encountered at a consumption site (inside an array value under a selector key), the plugin:

1. Resolves the fragment reference via `resolveBinding` (handles cross-file imports)
2. Statically evaluates the fragment's style object
3. Deep-merges all array elements (fragments + inline objects) using last-in-array-wins for flat properties, recursive merge for nested selectors

**Rationale**: `resolveBinding` already handles cross-file import resolution. `evaluateExpression` already handles static CSS object evaluation. The deep-merge is the only genuinely new logic needed.

### AD-5: Dev-Mode Global Style Injection

**Decision**: Create `packages/vanilla/src/runtime/inject-global.ts` — a lightweight function that:

1. Accepts CSS strings and a scoping class name
2. Creates a `<style>` element in `document.head` (browser only)
3. No-ops in Node/SSR environments (checks `typeof document !== 'undefined'`)
4. Does not use React — pure DOM API

The Babel plugin emits `injectGlobalStyles(css, className)` calls in dev mode. `babel-plugin-strip-runtime` removes these calls and replaces them with `.global.css` imports.

**Rationale**: Mirrors the existing `CC`/`CS` pattern but without React. Keeps the dev experience functional without requiring the full extraction pipeline.

### AD-6: `classNames` Transform

**Decision**: The Babel plugin transforms `classNames([styles.base, condition && styles.done])` into:

1. CSS extraction for all referenced `cssMap` variants (reusing existing `cssMap` transform)
2. Runtime code: `ax([styles.base, condition && styles.done])` where `ax` is imported from `@compiled/runtime`
3. Style injection: `CC`/`CS` components in React mode, or `injectStyles()` for vanilla mode

**Rationale**: Per the approved Non-React proposal, `classNames` is syntactic sugar that triggers extraction and gets replaced with `ax()` for runtime reconciliation.
