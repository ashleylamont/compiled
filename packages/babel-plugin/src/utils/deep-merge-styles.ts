/**
 * Recursively deep-merges an array of style objects.
 *
 * Rules:
 * - Flat CSS properties: last-in-array wins (later values override earlier)
 * - Nested selectors / at-rules: recursively merged, not overwritten
 *
 * Used by cssFragment resolution and array composition in globalStylesheet/cssMap.
 */
export function deepMergeStyles(objects: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      const incoming = obj[key];
      const existing = result[key];

      if (
        incoming !== null &&
        typeof incoming === 'object' &&
        !Array.isArray(incoming) &&
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing)
      ) {
        // Both values are plain objects — recurse
        result[key] = deepMergeStyles([
          existing as Record<string, unknown>,
          incoming as Record<string, unknown>,
        ]);
      } else {
        // Flat property or array — last-in wins
        result[key] = incoming;
      }
    }
  }

  return result;
}
