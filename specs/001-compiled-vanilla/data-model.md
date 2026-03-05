# Data Model: @compiled/vanilla

**Branch**: `001-compiled-vanilla` | **Date**: 2026-03-04

## Entities

### StyleMap (cssMap)

A compile-time entity representing a named mapping of variant keys to style
definitions.

| Field      | Type                            | Description                           |
| ---------- | ------------------------------- | ------------------------------------- |
| variants   | `Record<string, CSSProperties>` | Map of variant names to style objects |
| sourceFile | `string`                        | Absolute path to the defining module  |

**Lifecycle**: Defined at authoring time → statically evaluated at build time →
replaced with a map of variant keys to atomic class name strings.

**Validation**:

- All values MUST be statically evaluable
- Keys MUST be string literals
- Values MUST be valid CSS property objects (nested selectors, pseudo-classes,
  at-rules, `token()` calls permitted)

**Relationships**: Consumed by `classNames()` for runtime variant selection.

### ClassNameCall (classNames)

A compile-time marker representing a request to merge class names from one or
more `cssMap` variant references.

| Field     | Type                                              | Description                                         |
| --------- | ------------------------------------------------- | --------------------------------------------------- |
| arguments | `Array<StyleMapVariant \| ConditionalExpression>` | Array of variant references, optionally conditional |

**Lifecycle**: Authored as `classNames([styles.base, cond && styles.variant])` →
Babel plugin extracts CSS for all referenced variants → replaced with
`ax([styles.base, cond && styles.variant])` at build time.

**Validation**:

- Arguments MUST reference `cssMap` variant bindings
- TypeScript types enforce this at compile time
- Babel plugin emits error for unresolvable references

**Relationships**: Depends on `StyleMap` for variant definitions. Depends on
`ax()` runtime for class reconciliation.

### GlobalStylesheet (globalStylesheet)

A compile-time entity representing a map of named, non-atomic CSS rule blocks.

| Field             | Type                         | Description                               |
| ----------------- | ---------------------------- | ----------------------------------------- |
| blocks            | `Record<string, CSSRuleSet>` | Map of block names to CSS rule objects    |
| sourceFile        | `string`                     | Absolute path to the defining module      |
| scopingClassNames | `Record<string, string>`     | Generated `gs_<hash>` class per block key |

**Lifecycle**: Defined at authoring time → statically evaluated at build time →
CSS extracted to `.global.css` (production) or injected via `<style>` tag
(dev) → source replaced with map of keys to class name strings.

**State transitions**:

```
Authored → Evaluated → { Extracted (.global.css) | Injected (<style> tag) }
```

**Validation**:

- MUST be a module-level declaration (not inside functions/conditionals)
- All values MUST be statically evaluable
- Top-level keys MUST be string literals
- Values may contain nested selectors, pseudo-elements, at-rules, `token()`

**Relationships**: May compose `cssFragment` values via array syntax. Scoping
class names applied to wrapper elements at consumption site.

### StyleFragment (cssFragment)

A compile-time entity representing a reusable style recipe that produces no
CSS on its own.

| Field      | Type            | Description                                 |
| ---------- | --------------- | ------------------------------------------- |
| styles     | `CSSProperties` | Style object (may include nested selectors) |
| sourceFile | `string`        | Absolute path to the defining module        |

**Lifecycle**: Defined at authoring time → resolved via `resolveBinding` when
referenced at a consumption site → deep-merged into the consuming style object
→ consumed style object proceeds through normal CSS extraction.

**Validation**:

- All values MUST be statically evaluable
- No runtime variables or function parameters
- Circular references MUST be detected and produce compile-time error

**Relationships**: Consumed by `globalStylesheet`, `cssMap`, or `css()` via
array composition. Multiple fragments can be composed in a single array.
Deep-merge combines nested selectors; last-in-array wins for flat properties.

## Type Hierarchy

```
CSSProperties
├── Flat properties: { color: string, padding: number, ... }
├── Nested selectors: { '&::before': CSSProperties, '.child': CSSProperties }
├── At-rules: { '@media (min-width: 768px)': CSSProperties }
└── Array composition: { '&::before': [CSSFragment, CSSProperties, ...] }

StyleMap = Record<string, CSSProperties>
GlobalStylesheetInput = Record<string, Record<string, CSSProperties>>
CSSFragmentInput = CSSProperties
ClassNamesInput = Array<string | false | undefined | null>
```

## Build-Time Artifacts

| Input                     | Output (dev)                              | Output (production)                  |
| ------------------------- | ----------------------------------------- | ------------------------------------ |
| `cssMap({...})`           | Map literal + `injectStyles()` call       | Map literal + `.compiled.css` import |
| `classNames([...])`       | `ax([...])` call                          | `ax([...])` call                     |
| `globalStylesheet({...})` | Map literal + `injectGlobalStyles()` call | Map literal + `.global.css` import   |
| `cssFragment({...})`      | (no direct output)                        | (no direct output)                   |
