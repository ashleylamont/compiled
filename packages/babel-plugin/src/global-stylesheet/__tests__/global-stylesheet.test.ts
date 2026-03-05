import { transform } from '../../test-utils';

describe('globalStylesheet', () => {
  it('basic: single key with nested selector', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        tableCell: {
          '.pm-table-cell': { padding: '8px' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      import { injectGlobalStyles } from "@compiled/vanilla/runtime";
      export const styles = {
        tableCell: "gs_54nh3i",
      };
      injectGlobalStyles(".gs_54nh3i .pm-table-cell{padding:8px}", "gs_54nh3i");
      "
    `);
  });

  it('multiple keys produce distinct scoping class names', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        tableCell: {
          '.pm-table-cell': { padding: '8px' },
        },
        codeBlock: {
          '.code-block': { fontFamily: 'monospace' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      import { injectGlobalStyles } from "@compiled/vanilla/runtime";
      export const styles = {
        tableCell: "gs_54nh3i",
        codeBlock: "gs_pwtzwl",
      };
      injectGlobalStyles(".gs_54nh3i .pm-table-cell{padding:8px}", "gs_54nh3i");
      injectGlobalStyles(
        ".gs_pwtzwl .code-block{font-family:monospace}",
        "gs_pwtzwl"
      );
      "
    `);
  });

  it('nested selectors are properly scoped', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        editor: {
          '.pm-table-cell .code-block': { padding: '4px', color: 'red' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      import { injectGlobalStyles } from "@compiled/vanilla/runtime";
      export const styles = {
        editor: "gs_17dirda",
      };
      injectGlobalStyles(
        ".gs_17dirda .pm-table-cell .code-block{padding:4px;color:red}",
        "gs_17dirda"
      );
      "
    `);
  });

  it('throws when called inside a function body', () => {
    expect(() =>
      transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        function makeStyles() {
          const styles = globalStylesheet({
            tableCell: {
              '.pm-table-cell': { padding: '8px' },
            },
          });
          return styles;
        }
        `,
        { filename: 'test-file.ts' }
      )
    ).toThrow('globalStylesheet() must be called at the module level');
  });

  it('legacy and experiment keys produce two distinct CSS blocks with distinct gs_ class names', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        legacy: {
          '.pm-table-cell': { padding: '4px' },
        },
        experiment: {
          '.pm-table-cell': { padding: '8px' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    // Both keys must appear in the output
    expect(result).toContain('legacy:');
    expect(result).toContain('experiment:');
    // Two injectGlobalStyles calls must exist
    const injectCalls = (result.match(/injectGlobalStyles\(/g) || []).length;
    expect(injectCalls).toBe(2);
    // The two gs_ class names must be different from each other
    const classNames = [...result.matchAll(/injectGlobalStyles\([^,]+,\s*"(gs_[^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(classNames).toHaveLength(2);
    expect(classNames[0]).not.toEqual(classNames[1]);
    // Both must start with gs_
    expect(classNames[0]).toMatch(/^gs_/);
    expect(classNames[1]).toMatch(/^gs_/);
  });

  it('the generated class names for two different keys of the same globalStylesheet call are different from each other', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        alpha: {
          '.selector-a': { color: 'red' },
        },
        beta: {
          '.selector-b': { color: 'blue' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    const classNames = [...result.matchAll(/"(gs_[^"]+)"/g)].map((m) => m[1]);
    // Collect unique class names
    const unique = new Set(classNames);
    // There must be at least 2 distinct gs_ class names
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('resolves statically evaluable const bindings correctly', () => {
    // A `const` string binding should be resolved statically — not throw
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      const padding = '8px';
      export const styles = globalStylesheet({
        tableCell: {
          '.pm-table-cell': { padding: padding },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    expect(result).toContain('padding:8px');
    expect(result).toContain('injectGlobalStyles');
  });

  it('throws when a value contains a truly dynamic runtime value (function parameter)', () => {
    expect(() =>
      transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        export const styles = globalStylesheet({
          tableCell: {
            '.pm-table-cell': { padding: window.myPadding },
          },
        });
        `,
        { filename: 'test-file.ts' }
      )
    ).toThrow();
  });
});
