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
        cell: "gs_18oglda",
      };
      injectGlobalStyles(".gs_18oglda .child{color:red;font-size:14}", "gs_18oglda");
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

  it('throws when cssFragment contains a runtime variable', () => {
    expect(() =>
      transform(
        `
        import { cssFragment } from '@compiled/vanilla';
        const dynamic = 'red';
        const frag = cssFragment({ color: dynamic });
        `,
        { filename: 'test-file.ts' }
      )
    ).toThrow('cssFragment() values must be statically evaluable');
  });
});
