/**
 * Injects global CSS into the document head via a <style> element.
 * No-ops in SSR/Node environments.
 *
 * This is used by the Babel plugin in dev mode — in production,
 * babel-plugin-strip-runtime replaces these calls with .global.css imports.
 */
export function injectGlobalStyles(css: string, scopingClassName: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const existingStyle = document.querySelector(`style[data-compiled-global="${scopingClassName}"]`);
  if (existingStyle) {
    return;
  }

  const style = document.createElement('style');
  style.setAttribute('data-compiled-global', scopingClassName);
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}
