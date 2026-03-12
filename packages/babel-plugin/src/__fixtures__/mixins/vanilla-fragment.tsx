// eslint-disable-next-line import/no-extraneous-dependencies,react/jsx-filename-extension
import { cssFragment } from '@compiled/vanilla';

import { token } from './token-runtime';

export const subtleHighlight = cssFragment({
  '.pm-cell': {
    backgroundColor: token('color.background.accent.blue.subtlest', '#E9F2FF'),
    transition: 'background-color 0.2s ease-in-out',
  },
});
