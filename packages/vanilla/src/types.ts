import type { Properties } from 'csstype';

/**
 * A CSS properties object. Supports nested selectors, pseudo-classes, at-rules.
 * Values may be static strings/numbers or token() references.
 */
export type CSSProperties = Properties<string | number> & {
  [key: string]: CSSStyleValue | undefined;
};

/**
 * A value in a CSS style object. Can be:
 * - A plain CSS value (string or number)
 * - A nested style object (for selectors, pseudo-classes, at-rules)
 * - An array of style objects/fragments for composition (deep-merged at build time)
 */
export type CSSStyleValue = string | number | CSSProperties | CSSProperties[];

/**
 * Input type for cssMap — a record of variant names to style objects.
 */
export type CSSMapInput<V extends string> = Record<V, CSSProperties>;

/**
 * Input type for globalStylesheet — a record of block names to style objects or
 * arrays of style objects (for cssFragment composition).
 */
export type GlobalStylesheetInput = Record<string, CSSStyleValue>;

/**
 * Input type for cssFragment — a reusable style object.
 */
export type CSSFragmentInput = CSSProperties;
