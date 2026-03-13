import { transform } from '../../test-utils';

describe('cssFragment', () => {
  it('is replaced with a plain object literal', () => {
    const result = transform(
      `
      import { cssFragment } from '@compiled/vanilla';
      const frag = cssFragment({ color: 'red' });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      const frag = {
        color: "red",
      };
      "
    `);
  });

  it('produces no CSS output on its own', () => {
    const result = transform(
      `
      import { cssFragment } from '@compiled/vanilla';
      const frag = cssFragment({ '.child': { color: 'red' } });
      `,
      { filename: 'test-file.ts' }
    );
    // No injectGlobalStyles calls, no stylesheet emissions
    expect(result).not.toContain('injectGlobalStyles');
    expect(result).not.toContain('injectGlobalStyles');
    expect(result).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      const frag = {
        ".child": {
          color: "red",
        },
      };
      "
    `);
  });

  it('composed in globalStylesheet via array merges correctly', () => {
    const result = transform(
      `
      import { cssFragment, globalStylesheet } from '@compiled/vanilla';
      const base = cssFragment({ '.child': { color: 'red' } });
      export const styles = globalStylesheet({
        cell: [base, { '.child': { fontSize: 14 } }],
      });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      import { injectGlobalStyles } from "@compiled/vanilla/runtime";
      const base = {
        ".child": {
          color: "red",
        },
      };
      export const styles = {
        cell: "gs_hyijdw",
      };
      injectGlobalStyles(".gs_hyijdw .child{color:red;font-size:14px}", "gs_hyijdw");
      "
    `);
  });

  it('throws when cssFragment is inside a function body', () => {
    expect(() =>
      transform(
        `
        import { cssFragment } from '@compiled/vanilla';
        function makeStyles() {
          const frag = cssFragment({ color: 'red' });
          return frag;
        }
        `,
        { filename: 'test-file.ts' }
      )
    ).toThrow('cssFragment() must be assigned to a module-level variable');
  });

  it('globalStylesheet can consume cssFragment even when binding init is still a CallExpression (pre-transform order)', () => {
    // Simulate the case where the binding's init is still a cssFragment() CallExpression
    // (e.g. cross-file import scenario where the other file hasn't been transformed yet).
    // We replicate this by putting globalStylesheet BEFORE cssFragment in source order —
    // Babel visits in source order so globalStylesheet will run first, encountering
    // an unresolved cssFragment() call expression as the binding init.
    const result = transform(
      `
      import { cssFragment, globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        cell: [dangerHighlight, { '.child': { backgroundColor: 'red' } }],
      });
      const dangerHighlight = cssFragment({ '.child': { color: 'orange' } });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toContain('injectGlobalStyles');
    expect(result).toContain('color:orange');
    expect(result).toContain('background-color:red');
  });

  it('allows const primitive bindings as values', () => {
    // const bindings with primitive values are safe to inline — the value is
    // statically known and immutable. cssFragment just strips the wrapper,
    // and the consuming site (globalStylesheet) will resolve the identifier.
    const result = transform(
      `
      import { cssFragment } from '@compiled/vanilla';
      const myColor = 'red';
      const mySize = 12;
      const frag = cssFragment({ color: myColor, fontSize: mySize });
      `,
      { filename: 'test-file.ts' }
    );
    // Should not throw — const primitives are safe
    expect(result).toContain('color: myColor');
    expect(result).toContain('fontSize: mySize');
  });

  it('allows const string bindings in globalStylesheet (non-composed)', () => {
    // When a cssFragment with const bindings is used directly as a selector value
    // (not via array composition), buildCss resolves the identifiers normally.
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      const padding = '8px';
      export const styles = globalStylesheet({
        cell: {
          '.child': { padding: padding, color: 'blue' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toContain('padding:8px');
    expect(result).toContain('color:blue');
  });
});
