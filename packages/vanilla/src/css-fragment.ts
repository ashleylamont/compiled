import type { CSSFragmentInput } from './types.js';

/**
 * Defines a reusable style fragment that can be composed into cssMap,
 * globalStylesheet, or css() via array syntax.
 *
 * Produces no CSS output on its own — it is inlined at each consumption site
 * by the Babel plugin.
 *
 * This function must be compiled away — it throws at runtime if the Babel plugin
 * is not configured.
 *
 * @example
 * const baseStyles = cssFragment({ color: 'red', fontWeight: 'bold' });
 */
export function cssFragment(_styles: CSSFragmentInput): CSSFragmentInput {
  throw new Error(
    '@compiled/vanilla cssFragment() must be compiled away by @compiled/babel-plugin. ' +
      'Ensure @compiled/babel-plugin is configured in your Babel config.'
  );
}
