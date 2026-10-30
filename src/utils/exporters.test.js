import { describe, expect, it } from "vitest";
import { safeCell, tablesToCsv, tablesToTsv } from "./exporters";

describe("safeCell", () => {
  it("neutralises formula-looking cells", () => {
    expect(safeCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("+1+1x")).toBe("'+1+1x");
  });

  it("leaves normal text and plain numbers alone", () => {
    expect(safeCell("hello")).toBe("hello");
    expect(safeCell("-12.5")).toBe("-12.5");
    expect(safeCell(null)).toBe("");
  });
});

describe("tablesToCsv", () => {
  it("quotes cells and separates tables with a blank line", () => {
    const csv = tablesToCsv([[["a", 'b"c']], [["=x"]]]);
    expect(csv).toBe(`"a","b""c"\n\n"'=x"\n`);
  });
});

describe("tablesToTsv", () => {
  it("flattens tabs and newlines inside cells", () => {
    expect(tablesToTsv([[["a\tb", "c\nd"], ["e", null]]])).toBe("a b\tc d\ne\t");
  });
});
