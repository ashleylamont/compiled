/**
 * Merges class names from one or more cssMap variant references, ensuring
 * the last atomic style for each group wins.
 *
 * This function must be compiled away — it throws at runtime if the Babel plugin
 * is not configured.
 *
 * @example
 * classNames([styles.base, isActive && styles.active])
 */
export function classNames(_classNames: (string | false | null | undefined)[]): string {
  throw new Error(
    '@compiled/vanilla classNames() must be compiled away by @compiled/babel-plugin. ' +
      'Ensure @compiled/babel-plugin is configured in your Babel config.'
  );
}
