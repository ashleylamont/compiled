import { deepMergeStyles } from '../deep-merge-styles';

describe('deepMergeStyles', () => {
  it('returns {} for empty array', () => {
    expect(deepMergeStyles([])).toEqual({});
  });

  it('returns the single object as-is', () => {
    expect(deepMergeStyles([{ color: 'red', fontSize: 12 }])).toEqual({
      color: 'red',
      fontSize: 12,
    });
  });

  it('flat property override: last-in wins', () => {
    expect(deepMergeStyles([{ color: 'red' }, { color: 'blue' }])).toEqual({
      color: 'blue',
    });
  });

  it('nested selector merge: properties combined', () => {
    expect(
      deepMergeStyles([{ '&::before': { color: 'red' } }, { '&::before': { fontSize: 12 } }])
    ).toEqual({ '&::before': { color: 'red', fontSize: 12 } });
  });

  it('overlapping nested selectors: flat props within nested follow last-in wins', () => {
    expect(
      deepMergeStyles([
        { '&::before': { color: 'red', padding: 4 } },
        { '&::before': { color: 'blue' } },
      ])
    ).toEqual({ '&::before': { color: 'blue', padding: 4 } });
  });

  it('mixed flat + nested', () => {
    expect(
      deepMergeStyles([
        { color: 'red', '&:hover': { opacity: 0.5 } },
        { color: 'blue', '&:hover': { opacity: 1, display: 'block' } },
      ])
    ).toEqual({ color: 'blue', '&:hover': { opacity: 1, display: 'block' } });
  });

  it('three objects merged: last wins for flat, nested merged recursively', () => {
    expect(
      deepMergeStyles([
        { color: 'red', '&:hover': { opacity: 0.5, fontWeight: 'bold' } },
        { color: 'green', '&:hover': { opacity: 0.8 } },
        { color: 'blue', '&:hover': { opacity: 1 } },
      ])
    ).toEqual({
      color: 'blue',
      '&:hover': { opacity: 1, fontWeight: 'bold' },
    });
  });

  it('at-rule merge: inner objects merged', () => {
    expect(
      deepMergeStyles([
        { '@media (min-width: 768px)': { color: 'red' } },
        { '@media (min-width: 768px)': { fontSize: 14 } },
      ])
    ).toEqual({ '@media (min-width: 768px)': { color: 'red', fontSize: 14 } });
  });

  it('array value treated as flat property: last-in wins', () => {
    expect(
      deepMergeStyles([{ transform: ['rotate(0)', 'rotate(360deg)'] }, { transform: ['scale(1)'] }])
    ).toEqual({ transform: ['scale(1)'] });
  });
});
