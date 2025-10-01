import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { toSafeArray, useSafeArray } from "../src/index";

describe("toSafeArray", () => {
  it("returns the same array when already defined", () => {
    const array = [1, 2, 3];
    expect(toSafeArray(array)).toBe(array);
  });

  it("returns fallback when value is nullish", () => {
    const fallback = ["fallback"];
    expect(toSafeArray<string>(null, fallback)).toBe(fallback);
  });

  it("returns empty array for null without fallback", () => {
    expect(toSafeArray<number>(undefined)).toEqual([]);
  });
});

describe("useSafeArray", () => {
  it("returns provided array", () => {
    const array = [1];
    const { result } = renderHook(() => useSafeArray(array));
    expect(result.current).toBe(array);
  });

  it("returns fallback when value is nullish", () => {
    const fallback = ["fallback"];
    const { result } = renderHook(() => useSafeArray<string>(null, { fallback }));
    expect(result.current).toBe(fallback);
  });

  it("warns when a non-array is provided", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useSafeArray({} as unknown as string[]));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
