---
'@compiled/runtime': minor
---

New `@compiled/runtime` package: React-free shared runtime utilities (`ax`, `ac`, `insertRule`, `isServerEnvironment`, `isCacheDisabled`, `getShorthandDepth`, `cssCustomPropertyValue`). Extracted from `@compiled/react` so that non-React environments can use them without pulling in React.
