import type { CSSMapInput } from './types.js';

/**
 * Defines a map of CSS variants. Each variant is compiled to atomic CSS class names
 * at build time by the Babel plugin.
 *
 * This function must be compiled away — it throws at runtime if the Babel plugin
 * is not configured.
 *
 * @example
 * const styles = cssMap({
 *   base: { color: 'black', margin: 0 },
 *   done: { color: 'white', background: 'green' },
 * });
 */
export function cssMap<V extends string>(_styles: CSSMapInput<V>): Record<V, string> {
  throw new Error(
    '@compiled/vanilla cssMap() must be compiled away by @compiled/babel-plugin. ' +
      'Ensure @compiled/babel-plugin is configured in your Babel config.'
  );
}
