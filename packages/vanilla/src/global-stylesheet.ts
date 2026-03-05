import type { GlobalStylesheetInput } from './types.js';

/**
 * Defines a set of non-atomic CSS rule blocks, each scoped to a generated class name.
 * Used for descendant selectors and other patterns that cannot be expressed atomically.
 *
 * This function must be compiled away — it throws at runtime if the Babel plugin
 * is not configured.
 *
 * @example
 * const styles = globalStylesheet({
 *   tableCell: { '.pm-table-cell': { padding: 8 } },
 * });
 */
export function globalStylesheet<K extends string>(
  _styles: Record<K, GlobalStylesheetInput>
): Record<K, string> {
  throw new Error(
    '@compiled/vanilla globalStylesheet() must be compiled away by @compiled/babel-plugin. ' +
      'Ensure @compiled/babel-plugin is configured in your Babel config.'
  );
}
