# Tasks: @compiled/vanilla Package

**Input**: Design documents from `/specs/001-compiled-vanilla/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — the constitution mandates TDD (Principle III) and the spec requires inline snapshot tests for all Babel plugin changes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create `@compiled/runtime` shared package, `@compiled/vanilla` package skeleton, runtime stubs, and register the import source

- [ ] T001 Create @compiled/runtime package directory and package.json (no React peer dependency) at packages/runtime/package.json
- [ ] T002 [P] Create tsconfig.json at packages/runtime/ (mirror packages/utils/ conventions — CJS + ESM outputs)
- [ ] T003 [P] Move ax.ts from packages/react/src/runtime/ax.ts to packages/runtime/src/ax.ts
- [ ] T004 [P] Move ac.ts from packages/react/src/runtime/ac.ts to packages/runtime/src/ac.ts
- [ ] T005 [P] Move is-server-environment.ts from packages/react/src/runtime/ to packages/runtime/src/
- [ ] T006 [P] Move cache.ts from packages/react/src/runtime/ to packages/runtime/src/
- [ ] T007 [P] Move shorthand.ts from packages/react/src/runtime/ to packages/runtime/src/
- [ ] T008 [P] Move sheet.ts from packages/react/src/runtime/ to packages/runtime/src/
- [ ] T009 [P] Move css-custom-property.ts from packages/react/src/runtime/ to packages/runtime/src/
- [ ] T010 [P] Create types.ts at packages/runtime/src/types.ts with React-free types (Bucket, StyleSheetOpts, Depths)
- [ ] T011 Create barrel export at packages/runtime/src/index.ts (export all utilities)
- [ ] T012 Update @compiled/react to re-export runtime utilities from @compiled/runtime — update packages/react/src/runtime/index.ts to re-export ax, ac, sheet, etc. from @compiled/runtime so existing consumers are unaffected
- [ ] T013 Add @compiled/runtime as dependency in packages/react/package.json
- [ ] T014 Verify @compiled/react tests still pass after runtime extraction — run yarn workspace @compiled/react test
- [ ] T015 Create @compiled/vanilla package directory and package.json (no React peer dep, depends on @compiled/runtime) at packages/vanilla/package.json
- [ ] T016 Create tsconfig.json, tsconfig.browser.json, tsconfig.cjs.json at packages/vanilla/ (mirror packages/react/ conventions)
- [ ] T017 Create CJS entry point at packages/vanilla/index.js
- [ ] T018 [P] Create shared type definitions at packages/vanilla/src/types.ts (CSSProperties, CSSMapInput, GlobalStylesheetInput, CSSFragmentInput)
- [ ] T019 [P] Create runtime stubs — all four API stubs created upfront so barrel export works:
  - packages/vanilla/src/css-map.ts (typed function that throws if not compiled away)
  - packages/vanilla/src/class-names.ts (typed function that throws if not compiled away)
  - packages/vanilla/src/global-stylesheet.ts (typed function that throws if not compiled away)
  - packages/vanilla/src/css-fragment.ts (typed function that throws if not compiled away)
- [ ] T020 [P] Create public API barrel export at packages/vanilla/src/index.ts (export cssMap, classNames, globalStylesheet, cssFragment)
- [ ] T021 [P] Create vanilla runtime barrel at packages/vanilla/src/runtime/index.ts (re-export ax from @compiled/runtime)
- [ ] T022 Add @compiled/vanilla to DEFAULT_IMPORT_SOURCES in packages/utils/src/constants.ts
- [ ] T023 Add @compiled/runtime and @compiled/vanilla workspaces to root package.json workspaces array
- [ ] T024 Verify `yarn install` and `yarn build` succeed with both new packages

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Babel plugin infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T025 Register `classNames`, `globalStylesheet`, and `cssFragment` as recognised API names in the ImportDeclaration visitor at packages/babel-plugin/src/babel-plugin.ts (add to the compiledImports tracking alongside existing cssMap, styled, css, keyframes). Note: `cssMap` detection already works via DEFAULT_IMPORT_SOURCES — this task only registers the new API names.
- [ ] T026 Write test verifying that imports from `@compiled/vanilla` are detected by the Babel plugin at packages/babel-plugin/src/**tests**/index.test.ts
- [ ] T027 [P] Create deep-merge-styles utility at packages/babel-plugin/src/utils/deep-merge-styles.ts — recursive merge with last-in-array wins for flat properties, recursive combine for nested selectors
- [ ] T028 [P] Write tests for deep-merge-styles at packages/babel-plugin/src/utils/**tests**/deep-merge-styles.test.ts — cover: flat property override, nested selector merge, overlapping ::before/::after, mixed fragments + inline objects, empty arrays

**Checkpoint**: Foundation ready — Babel plugin recognises @compiled/vanilla imports and deep-merge utility is available

---

## Phase 3: User Story 1 — Atomic Styles in Non-React DOM (Priority: P1) 🎯 MVP

**Goal**: `cssMap` + `classNames` work with `@compiled/vanilla` imports, producing atomic CSS without React

**Independent Test**: Create a `.ts` file importing from `@compiled/vanilla`, run the Babel plugin, verify atomic CSS extraction and `classNames()` → `ax()` transformation

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T029 [P] [US1] Write snapshot test: cssMap from @compiled/vanilla produces atomic CSS at packages/babel-plugin/src/css-map/**tests**/css-map-vanilla.test.ts
- [ ] T030 [P] [US1] Write snapshot test: classNames([styles.base, cond && styles.done]) is replaced with ax() call (from @compiled/runtime) at packages/babel-plugin/src/class-names/**tests**/class-names.test.ts
- [ ] T031 [P] [US1] Write snapshot test: cssMap with token() calls resolves to var(--ds-...) at packages/babel-plugin/src/css-map/**tests**/css-map-vanilla.test.ts
- [ ] T032 [P] [US1] Write snapshot test: classNames with single variant resolves correctly at packages/babel-plugin/src/class-names/**tests**/class-names.test.ts
- [ ] T033 [P] [US1] Write test: cssMap deduplication — identical declarations across modules produce same class name at packages/babel-plugin/src/css-map/**tests**/css-map-vanilla.test.ts

### Implementation for User Story 1

- [ ] T034 [US1] Create classNames Babel handler at packages/babel-plugin/src/class-names/index.ts — detect classNames() calls, extract CSS for all referenced cssMap variants, replace with ax() import from @compiled/runtime
- [ ] T035 [US1] Route classNames CallExpression to visitClassNamesPath in packages/babel-plugin/src/babel-plugin.ts
- [ ] T036 [US1] Verify all US1 snapshot tests pass — update snapshots after confirming output is correct
- [ ] T037 [US1] Write integration test: toDOM-style usage pattern at packages/vanilla/src/**tests**/css-map.test.ts — cssMap + classNames in a non-React file

**Checkpoint**: cssMap + classNames work from @compiled/vanilla. Atomic CSS extracted, classNames → ax() at runtime. No React required.

---

## Phase 4: User Story 2 — Global/Non-Atomic Extracted CSS (Priority: P1)

**Goal**: `globalStylesheet` produces non-atomic CSS extracted to `.global.css` with hashed scoping class names per key

**Independent Test**: Define a `globalStylesheet` call, run the Babel plugin, verify `.global.css` output and class name map

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T038 [P] [US2] Write snapshot test: globalStylesheet produces class name map and CSS string at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts
- [ ] T039 [P] [US2] Write snapshot test: globalStylesheet with multiple keys produces distinct hashed class names at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts
- [ ] T040 [P] [US2] Write snapshot test: globalStylesheet with nested selectors, pseudo-elements, token() at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts
- [ ] T041 [P] [US2] Write error test: globalStylesheet inside function body emits compile-time error at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts
- [ ] T042 [P] [US2] Write error test: globalStylesheet with runtime variable emits compile-time error at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts
- [ ] T043 [P] [US2] Write test: dev-mode injectGlobalStyles() call is emitted in transformed output at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts

### Implementation for User Story 2

- [ ] T044 [US2] Create injectGlobalStyles runtime utility at packages/vanilla/src/runtime/inject-global.ts — plain DOM <style> injection, SSR-safe no-op
- [ ] T045 [US2] Export injectGlobalStyles from packages/vanilla/src/runtime/index.ts
- [ ] T046 [US2] Create globalStylesheet Babel handler at packages/babel-plugin/src/global-stylesheet/index.ts — statically evaluate style object, generate gs\_<hash> class names per key, serialise CSS with scoping selector, emit injectGlobalStyles() call + map literal
- [ ] T047 [US2] Route globalStylesheet CallExpression to visitGlobalStylesheetPath in packages/babel-plugin/src/babel-plugin.ts
- [ ] T048 [US2] Add module-level declaration check in globalStylesheet handler — emit error if call is inside function/conditional/loop
- [ ] T049 [US2] Add static evaluability check in globalStylesheet handler — emit error for runtime variables
- [ ] T050 [US2] Verify all US2 snapshot tests pass — update snapshots after confirming output is correct
- [ ] T051 [US2] Extend babel-plugin-strip-runtime to handle injectGlobalStyles() calls at packages/babel-plugin-strip-runtime/src/index.ts — collect CSS, write to .global.css, replace call with import
- [ ] T052 [US2] Write test for strip-runtime .global.css extraction at packages/babel-plugin-strip-runtime/src/**tests**/extract-styles.test.ts

**Checkpoint**: globalStylesheet produces scoped non-atomic CSS. Dev-mode injection works. Strip-runtime extracts to .global.css.

---

## Phase 5: User Story 5 — Package Usable Without React (Priority: P1)

**Goal**: Verify the zero-React contract — both `@compiled/runtime` and `@compiled/vanilla` install and work without React

**Independent Test**: Install packages in isolation, verify no React peer dep warnings, verify TypeScript compilation without React types

### Tests for User Story 5 ⚠️

- [ ] T053 [P] [US5] Write test: packages/vanilla/package.json and packages/runtime/package.json have no React in peerDependencies or dependencies at packages/vanilla/src/**tests**/integration.test.ts
- [ ] T054 [P] [US5] Write test: all source files in packages/vanilla/src/ and packages/runtime/src/ have zero React imports — grep-based validation at packages/vanilla/src/**tests**/integration.test.ts

### Implementation for User Story 5

- [ ] T055 [US5] Verify `yarn build` succeeds for @compiled/runtime and @compiled/vanilla without React types installed
- [ ] T056 [US5] Verify TypeScript compilation of a consumer file importing from @compiled/vanilla succeeds without @types/react

**Checkpoint**: Zero-React contract verified. Both packages install, build, and type-check without React.

---

## Phase 6: User Story 3 — Reusable Style Fragments with Array Composition (Priority: P2)

**Goal**: `cssFragment` enables cross-file style reuse with deep-merge composition in `globalStylesheet` and `cssMap`

**Independent Test**: Define a `cssFragment` in one file, import into a `globalStylesheet` in another, verify merged CSS output

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T057 [P] [US3] Write snapshot test: cssFragment composed via array in globalStylesheet produces merged CSS at packages/babel-plugin/src/css-fragment/**tests**/css-fragment.test.ts
- [ ] T058 [P] [US3] Write snapshot test: two cssFragments with overlapping ::before deep-merge correctly at packages/babel-plugin/src/css-fragment/**tests**/css-fragment.test.ts
- [ ] T059 [P] [US3] Write snapshot test: cssFragment imported cross-file resolves and inlines at packages/babel-plugin/src/css-fragment/**tests**/css-fragment.test.ts
- [ ] T060 [P] [US3] Write test: standalone cssFragment produces no CSS output at packages/babel-plugin/src/css-fragment/**tests**/css-fragment.test.ts
- [ ] T061 [P] [US3] Write error test: cssFragment with runtime variable emits compile-time error at packages/babel-plugin/src/css-fragment/**tests**/css-fragment.test.ts
- [ ] T062 [P] [US3] Write error test: circular cssFragment reference emits compile-time error at packages/babel-plugin/src/css-fragment/**tests**/css-fragment.test.ts

### Implementation for User Story 3

- [ ] T063 [US3] Create cssFragment Babel handler at packages/babel-plugin/src/css-fragment/index.ts — recognise cssFragment() calls, store statically evaluated object, resolve at consumption sites via resolveBinding, invoke deep-merge-styles for array composition
- [ ] T064 [US3] Route cssFragment CallExpression to visitCssFragmentPath in packages/babel-plugin/src/babel-plugin.ts
- [ ] T065 [US3] Add circular reference detection in cssFragment resolution — track visited fragments during resolution chain, emit error on cycle
- [ ] T066 [US3] Integrate array composition into globalStylesheet handler — when a selector value is an array, resolve fragments and deep-merge before CSS serialisation
- [ ] T067 [US3] Integrate array composition into cssMap handler — same array resolution for cssMap selector values
- [ ] T068 [US3] Verify all US3 snapshot tests pass — update snapshots after confirming output is correct

**Checkpoint**: cssFragment enables cross-file style reuse. Deep-merge handles overlapping nested selectors. Circular references caught.

---

## Phase 7: User Story 4 — Feature-Flag-Gated Style Variants (Priority: P2)

**Goal**: Multiple `globalStylesheet` keys produce independent class names that can be conditionally toggled

**Independent Test**: Define a `globalStylesheet` with `legacy` and `experiment` keys, verify both CSS blocks are extracted with distinct class names

### Tests for User Story 4 ⚠️

- [ ] T069 [P] [US4] Write snapshot test: globalStylesheet with legacy/experiment keys produces two distinct CSS blocks and class names at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts
- [ ] T070 [P] [US4] Write test: conditional class name application (ternary) works in transformed output at packages/babel-plugin/src/global-stylesheet/**tests**/global-stylesheet.test.ts

### Implementation for User Story 4

- [ ] T071 [US4] Verify per-key class name generation in globalStylesheet handler handles multiple keys correctly (this should already work from US2 — validate with tests)
- [ ] T072 [US4] Verify conditional expressions referencing globalStylesheet keys pass through untransformed (the runtime toggles class names, not the Babel plugin)
- [ ] T073 [US4] Verify all US4 snapshot tests pass

**Checkpoint**: Feature flag gating works via per-key class name toggling. Both variant CSS blocks ship in extracted output.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T074 [P] Write README.md for @compiled/vanilla at packages/vanilla/README.md — API overview, usage examples, build instructions
- [ ] T075 [P] Write README.md for @compiled/runtime at packages/runtime/README.md — shared runtime utilities overview
- [ ] T076 [P] Add sideEffects declaration to packages/vanilla/package.json — ["**/*.compiled.css", "**/*.global.css"]
- [ ] T077 [P] Create changeset for @compiled/runtime — minor version, describe new shared runtime package extracted from @compiled/react
- [ ] T078 [P] Create changeset for @compiled/react — minor version, describe runtime utilities now re-exported from @compiled/runtime
- [ ] T079 [P] Create changeset for @compiled/vanilla — minor version, describe new package and APIs
- [ ] T080 [P] Create changeset for @compiled/babel-plugin — minor version, describe vanilla import source support
- [ ] T081 [P] Create changeset for @compiled/babel-plugin-strip-runtime — minor version, describe .global.css extraction
- [ ] T082 [P] Create changeset for @compiled/utils — patch version, describe DEFAULT_IMPORT_SOURCES addition
- [ ] T083 Verify full monorepo build succeeds: yarn build (CJS + ESM + browser)
- [ ] T084 Run full test suite: yarn test — verify no regressions in existing packages (especially @compiled/react after runtime extraction)
- [ ] T085 Run lint and prettier: yarn lint && yarn prettier:check
- [ ] T086 Verify .global.css files are correctly picked up by Webpack and Parcel bundler integration tests
- [ ] T087 Run quickstart.md validation — execute all commands from specs/001-compiled-vanilla/quickstart.md and verify they work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. Includes @compiled/runtime extraction + @compiled/vanilla skeleton.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2)
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) — can run in parallel with US1
- **US5 (Phase 5)**: Depends on US1 and US2 completion (needs package to exist with real code to verify)
- **US3 (Phase 6)**: Depends on US2 (cssFragment is consumed by globalStylesheet handler)
- **US4 (Phase 7)**: Depends on US2 (validates globalStylesheet multi-key behaviour)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no story dependencies
- **US2 (P1)**: Can start after Phase 2 — no story dependencies, can run parallel with US1
- **US5 (P1)**: Depends on US1 + US2 — verifies the zero-React contract with real implementations
- **US3 (P2)**: Depends on US2 — cssFragment integrates into globalStylesheet handler
- **US4 (P2)**: Depends on US2 — validates multi-key globalStylesheet (should mostly pass from US2 implementation)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Babel handlers before routing in babel-plugin.ts
- Error handling after happy path
- Snapshot verification after implementation

### Parallel Opportunities

- T003–T010 can run in parallel (moving independent files to @compiled/runtime)
- T018, T019, T020, T021 can run in parallel (different vanilla package files)
- T027, T028 can run in parallel (different files)
- All US1 tests (T029–T033) can run in parallel
- All US2 tests (T038–T043) can run in parallel
- US1 and US2 can run in parallel after Phase 2
- All US3 tests (T057–T062) can run in parallel
- All Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (write first, ensure they fail):
Task: "Snapshot test: cssMap from @compiled/vanilla" (T029)
Task: "Snapshot test: classNames → ax() transform" (T030)
Task: "Snapshot test: cssMap with token() calls" (T031)
Task: "Snapshot test: classNames single variant" (T032)
Task: "Test: cssMap deduplication" (T033)

# Then implement sequentially:
Task: "classNames Babel handler" (T034) → "Route in babel-plugin.ts" (T035)
  → "Verify snapshots" (T036) → "Integration test" (T037)
```

## Parallel Example: User Story 1 + User Story 2

```bash
# After Phase 2 completes, both can start simultaneously:

# Developer A: US1
Task: T029–T033 (tests) → T034–T037 (implementation)

# Developer B: US2
Task: T038–T043 (tests) → T044–T052 (implementation)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T024) — includes @compiled/runtime extraction + @compiled/vanilla skeleton
2. Complete Phase 2: Foundational (T025–T028)
3. Complete Phase 3: User Story 1 (T029–T037)
4. **STOP and VALIDATE**: cssMap + classNames work from @compiled/vanilla, atomic CSS extracted, no React
5. Demo/share with Compiled team for early feedback

### Incremental Delivery

1. Setup + Foundational → @compiled/runtime extracted, @compiled/vanilla skeleton ready
2. US1 → Atomic styles for toDOM ✅ (MVP)
3. US2 → Global stylesheets for descendant selectors ✅
4. US5 → Zero-React contract verified ✅
5. US3 → Cross-file style fragments ✅
6. US4 → Feature flag gating validated ✅
7. Polish → Changesets, docs, full CI green ✅

### Parallel Team Strategy

With two developers:

1. Both complete Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (cssMap + classNames)
   - Developer B: US2 (globalStylesheet)
3. After US1 + US2 complete:
   - Developer A: US5 (zero-React verification)
   - Developer B: US3 (cssFragment — depends on US2 handler)
4. US4 is lightweight (validation of US2) — either developer
5. Polish tasks split by [P] parallelism

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (Constitution Principle III — TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Use `toMatchInlineSnapshot()` for all Babel plugin snapshot tests
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
