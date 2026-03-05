import { transform as transformCode } from '../../test-utils';

describe('classNames vanilla handler', () => {
  const transform = (code: string) => transformCode(code, { pretty: true });

  it('transforms classNames([styles.base]) to ax([styles.base])', () => {
    const actual = transform(`
      import { cssMap, classNames } from '@compiled/vanilla';
      const styles = cssMap({ base: { color: 'red' } });
      const cls = classNames([styles.base]);
    `);
    expect(actual).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      const styles = {
        base: "_syaz5scu",
      };
      const cls = ax([styles.base]);
      "
    `);
  });

  it('transforms classNames with conditional expression', () => {
    const actual = transform(`
      import { cssMap, classNames } from '@compiled/vanilla';
      const styles = cssMap({ base: { color: 'red' }, done: { color: 'green' } });
      const cls = classNames([styles.base, isDone && styles.done]);
    `);
    expect(actual).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      const styles = {
        base: "_syaz5scu",
        done: "_syazbf54",
      };
      const cls = ax([styles.base, isDone && styles.done]);
      "
    `);
  });

  it('transforms classNames with multiple variants', () => {
    const actual = transform(`
      import { cssMap, classNames } from '@compiled/vanilla';
      const styles = cssMap({ base: { color: 'red' }, variant: { fontWeight: 'bold' } });
      const cls = classNames([styles.base, styles.variant]);
    `);
    expect(actual).toMatchInlineSnapshot(`
      "import * as React from "react";
      import { ax, ix, CC, CS } from "@compiled/react/runtime";
      const styles = {
        base: "_syaz5scu",
        variant: "_k48p8n31",
      };
      const cls = ax([styles.base, styles.variant]);
      "
    `);
  });

  it('throws when classNames is called with no arguments', () => {
    expect(() =>
      transform(`
        import { classNames } from '@compiled/vanilla';
        const cls = classNames();
      `)
    ).toThrow();
  });

  it('throws when classNames is called with a non-array argument', () => {
    expect(() =>
      transform(`
        import { cssMap, classNames } from '@compiled/vanilla';
        const styles = cssMap({ base: { color: 'red' } });
        const cls = classNames(styles.base);
      `)
    ).toThrow();
  });
});
