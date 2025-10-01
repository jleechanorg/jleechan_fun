# react-use-safe-array

A tiny utility and React hook that normalises nullable array-like values into predictable arrays.

## Installation

```bash
npm install react-use-safe-array
# or
yarn add react-use-safe-array
```

`react-use-safe-array` lists `react` as a peer dependency and supports React 16.8 and newer. The package ships with
dual ESM/CommonJS bundles and auto-detected type definitions via the `exports` map so modern bundlers pick the right
entry point without extra configuration.

## Usage

```tsx
import { useSafeArray, toSafeArray } from "react-use-safe-array";

interface Props {
  items?: string[] | null;
}

function Example({ items }: Props) {
  const safeItems = useSafeArray(items, { fallback: ["Untitled"] });

  return (
    <ul>
      {safeItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

const plainArray = toSafeArray(itemsFromApi);
```

## API

### `useSafeArray(value, options?)`

Safely memoises potentially nullable props into an array.

- `value`: `T[] | null | undefined`
- `options.fallback`: optional array to use when `value` is nullish. Defaults to the same shared empty array (provide a memoised reference when passing custom fallbacks).
- `options.warnOnNonArray`: disables development warnings when set to `false`.

Returns the original array reference when `value` is already an array, otherwise the fallback array.

### `toSafeArray(value, fallback?)`

A non-React helper for normalising arrays in data layers, selectors, or tests. Accepts the same arguments as `useSafeArray` but without memoisation.

## Why not just `value ?? []`?

- Keeps developer warnings for accidental non-array values.
- Preserves referential equality when the input array is already safe.
- Shares a single empty array instance instead of creating a new array each render.
- Works seamlessly both in React components and plain TypeScript utilities.

## License

MIT

## Development

```bash
npm install
npm run typecheck
npm run test -- --run
npm run build
```

The library is bundled with [tsup](https://tsup.egoist.dev) and tested with [Vitest](https://vitest.dev).
