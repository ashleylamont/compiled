/**
 * Injects CSS custom property values scoped to a globalStylesheet class name.
 *
 * Produces a `<style>` element like:
 * ```css
 * .gs_abc1234 { --_xyz: var(--ds-color-border-danger, red); }
 * ```
 *
 * This allows `globalStylesheet` to support dynamic values (e.g. `token()` calls)
 * that can't be statically evaluated at compile time. The CSS rules reference
 * `var(--_xyz)` and this function sets the actual value at runtime, scoped to
 * the globalStylesheet's class so CSS inheritance works for descendant elements.
 *
 * No-ops in SSR/Node environments.
 */
export function injectGlobalCssVariables(
  scopingClassName: string,
  variables: Record<string, string>
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const dataAttr = `data-compiled-global-vars-${scopingClassName}`;
  const existingStyle = document.querySelector(`style[${dataAttr}]`);
  if (existingStyle) {
    return;
  }

  const declarations = Object.entries(variables)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');

  const css = `.${scopingClassName}{${declarations}}`;

  const style = document.createElement('style');
  style.setAttribute(dataAttr, '');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}
