import { dirname, join } from 'path';

import resolve from 'resolve';

import { transform as transformCode } from '../../test-utils';

const transform = (code: string, opts: Record<string, unknown> = {}) =>
  transformCode(code, opts as Parameters<typeof transformCode>[1]);

describe('globalStylesheet', () => {
  const atlaskitTokensFixturesRoot = join(__dirname, '../../__fixtures__/atlaskit-tokens');
  const atlaskitTokensResolver = {
    resolveSync(context: string, request: string) {
      if (request === '@atlaskit/tokens/token-names') {
        return join(atlaskitTokensFixturesRoot, 'token-names.tsx');
      }

      if (request === '@atlaskit/tokens/token-default-values') {
        return join(atlaskitTokensFixturesRoot, 'token-default-values.tsx');
      }

      return resolve.sync(
        request.charAt(0) === '.' ? join(context ? dirname(context) : '.', request) : request,
        {
          basedir: context ? dirname(context) : process.cwd(),
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
        }
      );
    },
  };
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
        tableCell: "gs_12whad4",
      };
      injectGlobalStyles(".gs_12whad4 .pm-table-cell{padding:8px}", "gs_12whad4");
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
        tableCell: "gs_12whad4",
        codeBlock: "gs_zogoh5",
      };
      injectGlobalStyles(".gs_12whad4 .pm-table-cell{padding:8px}", "gs_12whad4");
      injectGlobalStyles(
        ".gs_zogoh5 .code-block{font-family:monospace}",
        "gs_zogoh5"
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
        editor: "gs_1wqs5c4",
      };
      injectGlobalStyles(
        ".gs_1wqs5c4 .pm-table-cell .code-block{padding:4px;color:red}",
        "gs_1wqs5c4"
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

  it('handles full spike scenario: cssFragment + pre-resolved tokens + array composition + multiple keys', () => {
    // Simulates the AFP scenario where the tokens babel plugin has already run,
    // converting token() calls to string literals like 'var(--ds-border-danger, red)'.
    const result = transform(
      `
      import { globalStylesheet, cssFragment } from '@compiled/vanilla';

      const dangerHighlight = cssFragment({
        borderColor: 'var(--ds-border-danger, red)',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: 4,
      });

      const spikeStyles = globalStylesheet({
        decisions: {
          '.ProseMirror [data-decision-wrapper]': [
            dangerHighlight,
            {
              backgroundColor: 'var(--ds-background-danger, #ffebe6)',
            },
          ],
          '.ProseMirror [data-decision-wrapper] span': {
            color: 'var(--ds-text-danger, red)',
          },
        },
        editorBorder: {
          '.ProseMirror': {
            border: '3px dashed var(--ds-border-brand, blue)',
            borderRadius: 8,
            padding: 12,
          },
        },
      });
      `,
      { filename: 'test-spike.ts' }
    );
    // Log the full output for debugging
    console.log('FULL OUTPUT:', result);

    // Should produce injectGlobalStyles for both keys
    expect(result).toContain('injectGlobalStyles');
    // editorBorder should have correct CSS
    expect(result).toContain('border-radius:8px');
    expect(result).toContain('padding:12px');
    // Selectors should be preserved correctly — not mangled
    expect(result).toContain('.ProseMirror [data-decision-wrapper]');
    expect(result).toContain('.ProseMirror [data-decision-wrapper] span');
    // Token CSS vars should appear in the CSS
    expect(result).toContain('var(--ds-border-danger, red)');
    expect(result).toContain('var(--ds-background-danger, #ffebe6)');
    expect(result).toContain('var(--ds-text-danger, red)');
  });

  it('handles token() calls via injectGlobalCssVariables', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      import { token } from '@atlaskit/tokens';
      export const styles = globalStylesheet({
        cell: {
          '.child': { color: token('color.text.danger', 'red'), padding: '8px' },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    // CSS should contain var(--_hash) for the token() call
    expect(result).toContain('injectGlobalStyles');
    expect(result).toContain('var(--_');
    expect(result).toContain('padding:8px');
    // Should emit injectGlobalCssVariables with the token() expression
    expect(result).toContain('injectGlobalCssVariables');
    expect(result).toContain('token(');
  });

  it('handles dynamic runtime values via injectGlobalCssVariables', () => {
    const result = transform(
      `
      import { globalStylesheet } from '@compiled/vanilla';
      export const styles = globalStylesheet({
        tableCell: {
          '.pm-table-cell': { padding: window.myPadding },
        },
      });
      `,
      { filename: 'test-file.ts' }
    );
    // Dynamic values produce CSS variables + injectGlobalCssVariables call
    expect(result).toContain('injectGlobalCssVariables');
    expect(result).toContain('var(--_');
    expect(result).toContain('window.myPadding');
  });

  describe('bug reproductions', () => {
    it('does not kebab-case CSS selectors (selector mangling bug)', () => {
      // BUG: buildCss treats object keys as CSS property names and kebab-cases them.
      // `.ProseMirror` was becoming `.-prose-mirror` because buildCss kebab-cases all keys.
      // Selectors must be passed through as-is.
      const result = transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        export const styles = globalStylesheet({
          editor: {
            '.ProseMirror': { padding: '8px' },
          },
        });
        `,
        { filename: 'test-file.ts' }
      );
      // The selector MUST be preserved exactly — not kebab-cased
      expect(result).toContain('.ProseMirror');
      expect(result).not.toContain('.-prose-mirror');
      expect(result).not.toContain('Prose-mirror');
    });

    it('does not kebab-case complex selectors with attribute selectors', () => {
      // BUG: `.ProseMirror [data-decision-wrapper]` was becoming
      // `.-prose-mirror [data-decision-wrapper]`
      const result = transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        export const styles = globalStylesheet({
          decisions: {
            '.ProseMirror [data-decision-wrapper]': {
              backgroundColor: 'yellow',
            },
          },
        });
        `,
        { filename: 'test-file.ts' }
      );
      expect(result).toContain('.ProseMirror [data-decision-wrapper]');
      expect(result).not.toContain('.-prose-mirror');
      expect(result).toContain('background-color:yellow');
    });

    it('inlines cssFragment refs via deep-merge instead of creating CSS variables', () => {
      // BUG: When cssFragment ref appears in an array like [dangerHighlight, {...}],
      // buildCss can't resolve it and falls through to the catch-all, creating
      // var(--_hash) instead of inlining the fragment's styles.
      // The output was: `.gs_xxx .selector:var(--_lh50ie)` (garbled)
      // Expected: `.gs_xxx .selector{border-color:red;background-color:yellow}`
      const result = transform(
        `
        import { globalStylesheet, cssFragment } from '@compiled/vanilla';

        const dangerHighlight = cssFragment({
          borderColor: 'red',
          borderWidth: 2,
          borderStyle: 'solid',
        });

        export const styles = globalStylesheet({
          decisions: {
            '.ProseMirror [data-decision-wrapper]': [
              dangerHighlight,
              {
                backgroundColor: 'yellow',
              },
            ],
          },
        });
        `,
        { filename: 'test-file.ts' }
      );
      // cssFragment properties must be inlined (deep-merged), not turned into CSS variables
      expect(result).toContain('border-color:red');
      expect(result).toContain('border-width:2px');
      expect(result).toContain('border-style:solid');
      expect(result).toContain('background-color:yellow');
      // Must NOT have a CSS variable for the fragment ref
      expect(result).not.toContain('var(--_');
      // Selector must be preserved
      expect(result).toContain('.ProseMirror [data-decision-wrapper]');
      expect(result).not.toContain('.-prose-mirror');
    });

    it('resolves cssFragment imported from another file', () => {
      // Cross-file: cssFragment defined in a fixture, imported and used in globalStylesheet
      const result = transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        import { baseStyles } from '../../__fixtures__/mixins/fragments';

        export const styles = globalStylesheet({
          cell: {
            '.child': baseStyles,
          },
        });
        `,
        { filename: join(__dirname, 'cross-file-test.ts') }
      );
      expect(result).toContain('color:red');
      expect(result).toContain('font-size:14px');
      expect(result).toContain('.child');
    });

    it('resolves cssFragment call expression imported from another file via array composition', () => {
      // Cross-file: cssFragment() call in another file, consumed via array in globalStylesheet
      const result = transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        import { dangerHighlight } from '../../__fixtures__/mixins/fragments';

        export const styles = globalStylesheet({
          cell: {
            '.child': [dangerHighlight, { color: 'blue' }],
          },
        });
        `,
        { filename: join(__dirname, 'cross-file-test.ts') }
      );
      expect(result).toContain('border-color:red');
      expect(result).toContain('border-width:2px');
      expect(result).toContain('border-style:solid');
      expect(result).toContain('color:blue');
      expect(result).toContain('.child');
      // Should not create CSS variables for the fragment
      expect(result).not.toContain('var(--_');
    });

    it('handles template literals with unresolved expressions via CSS variables', () => {
      // When a cssFragment contains a template literal with expressions that can't
      // be statically evaluated (e.g. token() calls that haven't been transformed yet),
      // the array composition path should fall back to AST-level merging and let
      // buildCss handle it via CSS variables + injectGlobalCssVariables.
      const result = transform(
        `
        import { globalStylesheet, cssFragment } from '@compiled/vanilla';
        import { token } from '@atlaskit/tokens';

        const accentBorder = cssFragment({
          borderLeft: \`3px solid \${token('color.border.brand', 'blue')}\`,
        });

        export const styles = globalStylesheet({
          editor: {
            '.ProseMirror': [
              accentBorder,
              { padding: '8px' },
            ],
          },
        });
        `,
        { filename: join(__dirname, 'token-test.ts') }
      );
      // padding should be inlined statically
      expect(result).toContain('padding:8px');
      // The selector must be preserved
      expect(result).toContain('.ProseMirror');
      expect(result).not.toContain('.-prose-mirror');
      // The template literal with token() should produce a CSS variable
      expect(result).toContain('var(--_');
      expect(result).toContain('injectGlobalCssVariables');
      // border-left should be in the CSS (using a CSS variable)
      expect(result).toContain('border-left');
    });

    it('handles template literals with zero expressions (post-token-plugin)', () => {
      // After @atlaskit/tokens/babel-plugin runs, template literals like
      // `3px solid ${token('color.border.brand', 'blue')}` become
      // `3px solid var(--ds-border-brand, blue)` — still a TemplateLiteral AST node
      // with zero expressions. evaluateObjectExpressionStatic must handle this.
      const result = transform(
        `
        import { globalStylesheet, cssFragment } from '@compiled/vanilla';

        const accentBorder = cssFragment({
          borderLeft: \`3px solid var(--ds-border-brand, blue)\`,
        });

        export const styles = globalStylesheet({
          editor: {
            '.ProseMirror': [
              accentBorder,
              { padding: '8px' },
            ],
          },
        });
        `,
        { filename: 'test-file.ts' }
      );
      expect(result).toContain('border-left:3px solid var(--ds-border-brand, blue)');
      expect(result).toContain('padding:8px');
      expect(result).toContain('.ProseMirror');
      expect(result).not.toContain('var(--_');
    });

    it('resolves cross-file cssFragment with external calls when resolveModuleTransforms is configured', () => {
      // BUG: When a cssFragment in file A uses token() from @atlaskit/tokens,
      // and file B imports it, the token() call gets inlined as a raw CallExpression.
      // The token babel plugin never runs on this inlined AST (because resolveBinding
      // parses the raw source without running transforms), so the output contains
      // an unresolved token() call that throws ReferenceError at runtime.
      //
      // FIX: The resolveModuleTransforms option tells the plugin to run specified
      // Babel transforms on foreign files after parsing, so token() calls are
      // resolved to string literals before being inlined.
      const result = transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        import { subtleHighlight } from '../../__fixtures__/mixins/fragment-with-calls';

        export const styles = globalStylesheet({
          editor: {
            '.ProseMirror': [
              subtleHighlight,
              { padding: '8px' },
            ],
          },
        });
        `,
        {
          filename: join(__dirname, 'cross-file-token-test.ts'),
          resolveModuleTransforms: [
            [
              '@atlaskit/tokens/babel-plugin',
              { shouldUseAutoFallback: true, shouldForceAutoFallback: true },
            ],
          ],
          resolver: atlaskitTokensResolver,
        }
      );
      // token() calls should be resolved to var(--ds-...) strings
      expect(result).toContain('var(--ds-background-accent-blue-subtlest, #E9F2FF)');
      expect(result).toContain('background-color');
      expect(result).toContain('transition');
      expect(result).toContain('padding:8px');
      // Should NOT contain raw token() calls or CSS variables for them
      expect(result).not.toContain('token(');
      expect(result).not.toContain('injectGlobalCssVariables');
    });

    it('resolves cross-file cssFragment with template literal + external calls via resolveModuleTransforms', () => {
      // Tests the case where a cssFragment contains a template literal with
      // an embedded token() call, e.g. `3px solid ${token(...)}`
      const result = transform(
        `
        import { globalStylesheet } from '@compiled/vanilla';
        import { accentBorder } from '../../__fixtures__/mixins/fragment-with-calls';

        export const styles = globalStylesheet({
          editor: {
            '.ProseMirror': [
              accentBorder,
              { padding: '8px' },
            ],
          },
        });
        `,
        {
          filename: join(__dirname, 'cross-file-token-tpl-test.ts'),
          resolveModuleTransforms: [
            [
              '@atlaskit/tokens/babel-plugin',
              { shouldUseAutoFallback: true, shouldForceAutoFallback: true },
            ],
          ],
          resolver: atlaskitTokensResolver,
        }
      );
      // token() calls should be resolved
      expect(result).toContain('var(--ds-border-brand, #1868DB)');
      expect(result).toContain('var(--ds-radius-small, 4px)');
      expect(result).toContain('border-left');
      expect(result).toContain('border-radius');
      expect(result).toContain('padding:8px');
      // Should NOT contain raw token() calls
      expect(result).not.toContain('token(');
    });

    it('cross-file cssFragment with unresolved external calls throws without resolveModuleTransforms', () => {
      // Without the resolveModuleTransforms option, cross-file fragments containing
      // external call expressions (like token()) cannot be statically evaluated.
      // This results in a build error — which is the expected behavior that
      // resolveModuleTransforms was designed to solve.
      expect(() =>
        transform(
          `
          import { globalStylesheet } from '@compiled/vanilla';
          import { subtleHighlight } from '../../__fixtures__/mixins/fragment-with-calls';

          export const styles = globalStylesheet({
            editor: {
              '.ProseMirror': subtleHighlight,
            },
          });
          `,
          {
            filename: join(__dirname, 'cross-file-no-transform-test.ts'),
          }
        )
      ).toThrow('globalStylesheet() values must be statically evaluable');
    });

    it('handles the full spike scenario correctly end-to-end', () => {
      // Full reproduction of the AFP spike scenario:
      // - cssFragment composition via array
      // - pre-resolved token values (strings)
      // - multiple variant keys
      // - complex selectors with attribute selectors
      const result = transform(
        `
        import { globalStylesheet, cssFragment } from '@compiled/vanilla';

        const dangerHighlight = cssFragment({
          borderColor: 'var(--ds-border-danger, red)',
          borderWidth: 2,
          borderStyle: 'solid',
          borderRadius: 4,
        });

        const spikeStyles = globalStylesheet({
          decisions: {
            '.ProseMirror [data-decision-wrapper]': [
              dangerHighlight,
              {
                backgroundColor: 'var(--ds-background-danger, #ffebe6)',
              },
            ],
            '.ProseMirror [data-decision-wrapper] span': {
              color: 'var(--ds-text-danger, red)',
            },
          },
          editorBorder: {
            '.ProseMirror': {
              border: '3px dashed var(--ds-border-brand, blue)',
              borderRadius: 8,
              padding: 12,
            },
          },
        });
        `,
        { filename: 'test-spike.ts' }
      );
      // Selectors must be preserved verbatim
      expect(result).toContain('.ProseMirror [data-decision-wrapper]');
      expect(result).toContain('.ProseMirror [data-decision-wrapper] span');
      expect(result).not.toContain('.-prose-mirror');

      // cssFragment properties must be deep-merged and inlined
      expect(result).toContain('border-color:var(--ds-border-danger, red)');
      expect(result).toContain('border-width:2px');
      expect(result).toContain('border-style:solid');
      expect(result).toContain('border-radius:4px');
      // Inline styles from the array must also be present
      expect(result).toContain('background-color:var(--ds-background-danger, #ffebe6)');

      // Second selector's styles
      expect(result).toContain('color:var(--ds-text-danger, red)');

      // editorBorder key styles
      expect(result).toContain('border-radius:8px');
      expect(result).toContain('padding:12px');

      // No CSS variables should be created for pre-resolved token strings
      expect(result).not.toContain('var(--_');
      expect(result).not.toContain('injectGlobalCssVariables');
    });
  });
});
