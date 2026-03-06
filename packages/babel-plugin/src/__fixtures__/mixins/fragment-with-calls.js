import { token } from '@atlaskit/tokens';
// eslint-disable-next-line import/no-extraneous-dependencies
import { cssFragment } from '@compiled/vanilla';

export const subtleHighlight = cssFragment({
  backgroundColor: token('color.background.accent.blue.subtlest', '#E9F2FF'),
  transition: 'background-color 0.2s ease-in-out',
});

export const accentBorder = cssFragment({
  borderLeft: `3px solid ${token('color.border.brand', 'blue')}`,
  borderRadius: token('radius.small', '4px'),
});
