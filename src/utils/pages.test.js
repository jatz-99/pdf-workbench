import { describe, expect, it } from "vitest";
import { movePage } from "./pages";

describe("movePage", () => {
  it("moves a page later", () => {
    expect(movePage(4, 1, 3)).toEqual([2, 3, 1, 4]);
  });
  it("moves a page earlier", () => {
    expect(movePage(4, 4, 2)).toEqual([1, 4, 2, 3]);
  });
  it("keeps the order for no-op or out-of-range moves", () => {
    expect(movePage(3, 2, 2)).toEqual([1, 2, 3]);
    expect(movePage(3, 0, 2)).toEqual([1, 2, 3]);
    expect(movePage(3, 1, 9)).toEqual([1, 2, 3]);
  });
});
