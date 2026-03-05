<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0
Bump rationale: MINOR — Principle III materially expanded to mandate TDD
                (Red-Green-Refactor) and comprehensive behavioural testing as
                the primary specification mechanism.

Modified principles:
  - III. Test-First & Snapshot Discipline → renamed to
    "Test-Driven Development & Snapshot Discipline". Added explicit TDD cycle,
    requirement for tests to serve as living behavioural specification,
    comprehensive edge-case coverage mandate. Rationale expanded.

Added sections: none

Removed sections: none

Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check section present;
     references generic principle gates (no stale names)
  ✅ .specify/templates/spec-template.md — Functional Requirements and Success
     Criteria sections align with compile-time and atomic-CSS principles
  ✅ .specify/templates/tasks-template.md — Test-First phase ordering matches
     Principle III; no stale agent-specific references found

Deferred TODOs:
  - RATIFICATION_DATE: exact original adoption date unknown; set to
    2026-03-04 as the first formal ratification of this constitution.
-->

# Compiled Constitution

## Core Principles

### I. Compile-Time CSS Generation (NON-NEGOTIABLE)

All CSS MUST be fully determined and emitted at build time via Babel AST
transformation. Runtime CSS generation is strictly prohibited. Dynamic values
are handled exclusively through CSS custom properties (variables) injected via
`style` props — never through runtime style computation or string concatenation.
New features MUST preserve zero-runtime CSS generation.

CSS extraction follows a deliberate two-phase architecture:

1. `@compiled/babel-plugin` transforms CSS-in-JS into runtime code with
   embedded styles.
2. `@compiled/babel-plugin-strip-runtime` (opt-in) extracts styles to static
   `.compiled.css` files for production.

These phases MUST remain separate packages with independent responsibilities.
Consumers using extraction MUST declare `"sideEffects": ["**/*.compiled.css"]`
in their `package.json` to prevent tree-shaking of extracted stylesheets.

**Rationale**: The core value proposition of Compiled is performance. Shipping
CSS at compile time eliminates the runtime cost of CSS-in-JS and enables
server-side rendering without style flicker. The two-phase split keeps the
transform portable while making extraction an opt-in production optimisation.

### II. Atomic CSS Architecture

Every CSS declaration MUST be emitted as a single atomic rule. Class names
encode the atomic group (`property + selectors + at-rules`) and value, using
the 4-char group + 4-char value encoding (e.g., `_1wyb1fwx`). The `ax()`
runtime utility MUST be used to merge atomic class names, ensuring last-write
wins per atomic group. No two atomic rules for the same group may coexist on
an element.

**Rationale**: Atomic CSS eliminates specificity conflicts, minimises total
stylesheet size, and enables deterministic style composition across component
boundaries.

### III. Test-Driven Development & Snapshot Discipline (NON-NEGOTIABLE)

Test-Driven Development (TDD) MUST be followed for all non-trivial changes.
The Red-Green-Refactor cycle applies:

1. **Red**: Write tests that define the expected behaviour. Tests MUST fail
   before implementation begins.
2. **Green**: Implement the minimum code to make the tests pass.
3. **Refactor**: Clean up while keeping tests green.

Tests are the **primary mechanism for defining and documenting behaviour**.
Where possible, tests MUST comprehensively specify the behavioural contract of
a feature — including edge cases, error conditions, and boundary values — so
that the test suite serves as a living specification. When reviewing a feature,
the tests alone MUST be sufficient to understand what the feature does.

Additional requirements:

- Babel plugin changes MUST include inline snapshot tests using
  `toMatchInlineSnapshot()`.
- Bug fixes MUST include a regression test that reproduces the failure before
  the fix is applied.
- Visual changes MUST be validated via Loki visual regression tests.
- Snapshots MUST NOT be manually edited — use `--updateSnapshot` only after
  confirming the output is correct.

**Rationale**: The transformation pipeline is complex; tests serve as both a
safety net and the authoritative specification of behaviour. TDD ensures that
requirements are understood before code is written, and comprehensive test
suites make the codebase approachable for new contributors.

### IV. Bundler-Agnostic Integration

Compiled MUST function correctly with Webpack (4 and 5), Parcel v2, and direct
Babel usage. No bundler-specific behaviour MUST leak into `@compiled/babel-plugin`
or `@compiled/react`. Bundler integrations are isolated to dedicated packages
(`@compiled/webpack-loader`, `@compiled/parcel-transformer`,
`@compiled/parcel-optimizer`). New features requiring bundler-specific code MUST
be implemented in the appropriate integration package, not in the core.

**Rationale**: Compiled serves a diverse ecosystem; bundler lock-in would
fragment the user base and complicate maintenance.

### V. Simplicity & YAGNI

Complexity MUST be justified. Every new abstraction, package, or API MUST have
a clear, documented purpose. Organisational-only packages are not permitted.
Start simple; generalise only when a second concrete use case exists. The
`packages/utils/` shared library MUST be preferred over duplicating logic across
packages.

**Rationale**: A compile-time library that is hard to reason about defeats its
own purpose. Keeping the codebase lean makes it easier for contributors and
consumers alike.

### VI. Deterministic CSS Ordering

Atomic CSS rules MUST be emitted in a deterministic, spec-compliant order.
Specifically:

- **Shorthand expansion**: Shorthand properties (e.g., `margin`, `border`,
  `background`) MUST be expanded into their longhand equivalents and sorted
  so that longhands always override shorthands, regardless of source order.
- **Pseudo-selector ordering**: Pseudo-class rules MUST follow LVFHA order:
  `:link` → `:visited` → `:focus-within` → `:focus` → `:focus-visible` →
  `:hover` → `:active`. This ordering is enforced by
  `sort-pseudo-selectors.ts` and the style bucket system.
- **At-rule sorting**: Media queries MUST be sorted mobile-first (ascending
  `min-width`). At-rules with identical conditions MUST be merged by
  `merge-duplicate-at-rules.ts`.
- **Style buckets**: Runtime style injection uses ordered buckets (default →
  link → focus → interaction → at-rules). Changes to bucket ordering are a
  breaking change and MUST follow a MAJOR version bump.

Any change to ordering logic MUST include snapshot tests demonstrating the
before/after rule order and visual regression validation.

**Rationale**: CSS cascade order determines which styles win. Non-deterministic
ordering causes silent, hard-to-diagnose visual regressions across browsers
and build environments.

### VII. Stable Output Contract

The atomic class name format `_{group}{value}` (underscore prefix, 4-char
group hash, 4+ char value hash) is a de facto public API. Changes to:

- The class name encoding scheme
- The hash algorithm or seed
- The `ATOMIC_GROUP_LENGTH` constant (currently 5 including the underscore)
- The CSS variable naming pattern for dynamic values (`--_` prefix)

MUST be treated as a **MAJOR** breaking change, gated behind a semver major
bump, and communicated in the changelog with a migration guide. Consumers
depend on this format for snapshot tests, CSS caching, server-side rendering
hydration, and production debugging.

The runtime utilities `ax()`, `ac()`, and `ix()` are part of the stable
contract. Their function signatures MUST NOT change without a major version
bump. Internal utilities (`CC`, `CS`) may evolve but MUST maintain backward
compatibility within the same major version.

**Rationale**: Compiled's output is consumed by build pipelines, test suites,
and production caches. Silent format changes cause cascading failures that are
expensive to diagnose.

## Technology Stack & Tooling Constraints

- **Language**: TypeScript (strict mode). All new source files MUST be `.ts`
  or `.tsx`; plain `.js` files in `src/` are not permitted.
- **Compiler**: `ttsc` (TypeScript Transformer Compiler). Do not substitute
  plain `tsc` for build steps.
- **Build outputs**: CJS (`packages/tsconfig.json`), ESM
  (`packages/tsconfig.esm.json`), browser (`packages/tsconfig.browser.json`).
  All three MUST build cleanly before a release.
- **Package manager**: Yarn (classic). Do not commit `package-lock.json` or
  `npm-shrinkwrap.json` to core packages.
- **Testing**: Jest with `@compiled/jest` matchers. Test files MUST follow
  `*.test.ts(x)` naming; `*.spec.*` is not used in this project.
- **Formatting**: Prettier (config in `.prettierrc`). All files MUST pass
  `yarn prettier:check` before merge.
- **Linting**: ESLint with `@compiled/eslint-plugin`. All files MUST pass
  `yarn lint` before merge.
- **Changesets**: Releases MUST use `yarn changeset`. Select `minor` for new
  features, `patch` for bug fixes. Changeset messages MUST be informative.
- **Public repo safety**: This is a public repository. Internal or sensitive
  Atlassian information MUST NOT appear in source, comments, or commit messages.

## Development Workflow & Quality Gates

- **Feature branches**: Named descriptively (e.g., `fix/css-map-specificity`,
  `feat/xcss-strict-api`). Do not commit directly to `main`.
- **Pull requests**: MUST reference an issue for non-trivial changes. For
  significant changes, open an issue for discussion before raising a PR.
- **Review gate**: All PRs MUST pass CI (build, unit tests, lint, prettier)
  before merging.
- **Snapshot updates**: MUST be reviewed carefully in PR diff. Unexplained
  snapshot changes are a blocking concern.
- **Visual regression**: Run `yarn test:vr` for any change affecting rendered
  output. Accept with `yarn test:vr approve` only after visual verification.
- **CLA**: External contributors MUST sign the Atlassian CLA before their PR
  can be merged. Atlassian employees are exempt.
- **Constitution compliance**: Every PR MUST be evaluated against this
  constitution. Violations MUST be documented in the Complexity Tracking table
  of the relevant `plan.md` with explicit justification.

## Governance

This constitution supersedes all other informal practices and conventions for
the Compiled project. Amendments require:

1. A proposal (GitHub issue or PR description) describing the change and its
   rationale.
2. Review and approval by a project maintainer.
3. A version bump to this document following semantic versioning:
   - **MAJOR**: Removal or backward-incompatible redefinition of a principle.
   - **MINOR**: New principle or materially expanded guidance added.
   - **PATCH**: Clarifications, wording fixes, or non-semantic refinements.
4. Update of the Sync Impact Report comment at the top of this file.
5. Propagation of any changes to dependent templates
   (`.specify/templates/plan-template.md`, `spec-template.md`,
   `tasks-template.md`) in the same commit.

All PRs and code reviews MUST verify compliance with the Core Principles above.
Complexity that violates a principle MUST be explicitly justified — "it's easier"
is not sufficient justification. Runtime guidance for agents is in `AGENTS.md`
(repo root) and `.rovodev/prompts.yml`.

**Version**: 1.2.0 | **Ratified**: 2026-03-04 | **Last Amended**: 2026-03-04
