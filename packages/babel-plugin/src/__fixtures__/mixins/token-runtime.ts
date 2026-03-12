// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const token = (name: string, fallback?: string) =>
  `UNTRANSFORMED_TOKEN(${name}, ${fallback ?? ''})`;
