import { describe, it, expect } from "bun:test";
import { extractPreferences } from "../src/extract/preferences";
import type { NormalizedBlock } from "../src/types";

describe("extractPreferences", () => {
  it("returns empty for no blocks", () => {
    expect(extractPreferences([])).toEqual([]);
  });

  it("captures preference patterns from user", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "user", text: "I prefer TypeScript over JavaScript" },
    ];
    expect(extractPreferences(blocks).length).toBe(1);
  });

  it("ignores assistant blocks", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "assistant", text: "I always use best practices" },
    ];
    expect(extractPreferences(blocks)).toEqual([]);
  });

  it("captures please use pattern", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "user", text: "please use bun instead of node" },
    ];
    expect(extractPreferences(blocks).length).toBe(1);
  });

  it("ignores extension-injected user blocks", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "user", text: "Never run reviewer children during a window", injected: true },
    ];
    expect(extractPreferences(blocks)).toEqual([]);
  });

  it("strips the list marker from a numbered rule", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "user", text: "Rules:\n4. Commit often\n5. Never run reviewer children during a window" },
    ];
    expect(extractPreferences(blocks)).toEqual(["Never run reviewer children during a window"]);
  });
});
