import type { Properties } from 'csstype';

/**
 * A CSS properties object. Supports nested selectors, pseudo-classes, at-rules.
 * Values may be static strings/numbers or token() references.
 */
export type CSSProperties = Properties<string | number> & {
  [key: string]: CSSProperties | string | number | undefined;
};

/**
 * Input type for cssMap — a record of variant names to style objects.
 */
export type CSSMapInput<V extends string> = Record<V, CSSProperties>;

/**
 * Input type for globalStylesheet — a record of block names to style objects.
 */
export type GlobalStylesheetInput = Record<string, CSSProperties>;

/**
 * Input type for cssFragment — a reusable style object.
 */
export type CSSFragmentInput = CSSProperties;
