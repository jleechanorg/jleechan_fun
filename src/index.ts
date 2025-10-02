import { useMemo } from "react";

const EMPTY_ARRAY: unknown[] = [];
Object.freeze(EMPTY_ARRAY);

/**
 * Normalises nullable values into safe arrays that can be consumed without
 * repeatedly adding nullish guards throughout application code.
 *
 * @example
 * ```ts
 * const items = toSafeArray(props.items);
 * items.map((item) => item);
 * ```
 */
export function toSafeArray<T>(
  value: readonly T[] | null | undefined,
  fallback: readonly T[] = EMPTY_ARRAY as T[],
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value != null) {
    warnWhenEnabled("toSafeArray received a non-array value:", value);
  }

  if (!Array.isArray(fallback)) {
    warnWhenEnabled("toSafeArray fallback is not an array. Using an empty array instead.", fallback);
    return EMPTY_ARRAY as T[];
  }

  return fallback as T[];
}

export interface UseSafeArrayOptions<T> {
  /**
   * Optional fallback array when the provided value is nullish.
   * Defaults to an empty array to maintain referential stability.
   */
  readonly fallback?: readonly T[];
  /**
   * Disable the development warning when a non-array value is passed.
   */
  readonly warnOnNonArray?: boolean;
}

/**
 * React hook that safely converts potentially null/undefined values to arrays.
 *
 * This hook ensures we always get a valid array for safe operations (.length, .map, etc.)
 * while maintaining proper React memoisation for performance.
 */
export function useSafeArray<T>(
  value: readonly T[] | null | undefined,
  options: UseSafeArrayOptions<T> = {},
): T[] {
  const { fallback = EMPTY_ARRAY as T[], warnOnNonArray = true } = options;

  return useMemo(() => {
    if (warnOnNonArray && value != null && !Array.isArray(value)) {
      warnWhenEnabled("useSafeArray received a non-array value:", value);
    }

    if (Array.isArray(value)) {
      return value as T[];
    }

    if (!Array.isArray(fallback)) {
      warnWhenEnabled("useSafeArray fallback is not an array. Using an empty array instead.", fallback);
      return EMPTY_ARRAY as T[];
    }

    return fallback as T[];
  }, [value, fallback, warnOnNonArray]);
}

function warnWhenEnabled(message: string, payload: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(message, payload);
  }
}
