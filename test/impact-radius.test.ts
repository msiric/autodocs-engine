import { describe, it, expect } from "vitest";
import { computeImpactRadius, impactLabel, complexityLabel } from "../src/impact-radius.js";
import type { CallGraphEdge } from "../src/types.js";

function edge(from: string, to: string, fromFile = "a.ts", toFile = "b.ts"): CallGraphEdge {
  return { from, to, fromFile, toFile };
}

describe("computeImpactRadius", () => {
  it("returns empty for small call graphs (<10 edges)", () => {
    const edges = [edge("A", "B"), edge("C", "D")];
    const result = computeImpactRadius(edges);
    expect(result.highImpact).toEqual([]);
    expect(result.complex).toEqual([]);
  });

  it("returns empty for empty call graph", () => {
    const result = computeImpactRadius([]);
    expect(result.highImpact).toEqual([]);
    expect(result.complex).toEqual([]);
  });

  it("computes direct callers (in-degree)", () => {
    // X is called by A, B, C, D, E — plus filler edges to reach minimum
    const edges = [
      edge("A", "X"), edge("B", "X"), edge("C", "X"), edge("D", "X"), edge("E", "X"),
      edge("F", "G"), edge("H", "I"), edge("J", "K"), edge("L", "M"), edge("N", "O"),
    ];
    const result = computeImpactRadius(edges);
    const xEntry = result.highImpact.find((e) => e.functionName === "X");
    expect(xEntry).toBeDefined();
    expect(xEntry!.directCallers).toBe(5);
  });

  it("computes transitive callers via BFS", () => {
    // Chain: A→B→C→X, D→X, E→B (so X has 2 direct callers: C, D; transitive: A, B, C, D, E = 5)
    const edges = [
      edge("A", "B"), edge("B", "C"), edge("C", "X"), edge("D", "X"), edge("E", "B"),
      // Filler to reach minimum
      edge("F", "G"), edge("H", "I"), edge("J", "K"), edge("L", "M"), edge("N", "O"),
    ];
    const result = computeImpactRadius(edges);
    const xEntry = result.highImpact.find((e) => e.functionName === "X");
    expect(xEntry).toBeDefined();
    expect(xEntry!.directCallers).toBe(2); // C and D call X directly
    expect(xEntry!.transitiveCallers).toBe(5); // A, B, C, D, E all transitively affected
  });

  it("computes diamond pattern correctly", () => {
    // A→B, A→C, B→D, C→D — D has 2 direct callers, 3 transitive (A, B, C)
    const edges = [
      edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D"),
      // Filler
      edge("E", "F"), edge("G", "H"), edge("I", "J"), edge("K", "L"), edge("M", "N"), edge("O", "P"),
    ];
    const result = computeImpactRadius(edges);
    const dEntry = result.highImpact.find((e) => e.functionName === "D");
    expect(dEntry).toBeDefined();
    expect(dEntry!.directCallers).toBe(2);
    expect(dEntry!.transitiveCallers).toBe(3); // A, B, C
  });

  it("identifies complex functions (high out-degree)", () => {
    // A calls B, C, D, E, F — high out-degree
    const edges = [
      edge("A", "B"), edge("A", "C"), edge("A", "D"), edge("A", "E"), edge("A", "F"),
      // Some other edges for minimum + to give B callers so it appears in highImpact
      edge("G", "B"), edge("H", "B"), edge("I", "B"), edge("J", "B"), edge("K", "B"),
    ];
    const result = computeImpactRadius(edges);

    // A should be in complex (5 calls)
    const aEntry = result.complex.find((e) => e.functionName === "A");
    expect(aEntry).toBeDefined();
    expect(aEntry!.directCalls).toBe(5);
  });

  it("separates high-impact from complex (no duplicates)", () => {
    // X is both heavily called AND calls many things
    const edges = [
      edge("A", "X"), edge("B", "X"), edge("C", "X"), edge("D", "X"), edge("E", "X"),
      edge("X", "Y"), edge("X", "Z"), edge("X", "W"),
      edge("F", "G"), edge("H", "I"),
    ];
    const result = computeImpactRadius(edges);

    // X should be in highImpact (5 callers)
    const inHigh = result.highImpact.find((e) => e.functionName === "X");
    expect(inHigh).toBeDefined();

    // X should NOT also be in complex (excluded because it's in highImpact)
    const inComplex = result.complex.find((e) => e.functionName === "X");
    expect(inComplex).toBeUndefined();
  });

  it("includes file paths from call graph edges", () => {
    const edges = [
      edge("A", "X", "src/a.ts", "src/x.ts"),
      edge("B", "X", "src/b.ts", "src/x.ts"),
      edge("C", "X", "src/c.ts", "src/x.ts"),
      edge("D", "Y", "src/d.ts", "src/y.ts"),
      edge("E", "Y", "src/e.ts", "src/y.ts"),
      edge("F", "G"), edge("H", "I"), edge("J", "K"), edge("L", "M"), edge("N", "O"),
    ];
    const result = computeImpactRadius(edges);
    const xEntry = result.highImpact.find((e) => e.functionName === "X");
    expect(xEntry?.file).toBe("src/x.ts");
  });
});

describe("labels", () => {
  it("impactLabel returns correct severity", () => {
    expect(impactLabel(25)).toBe("Critical — widely depended on");
    expect(impactLabel(15)).toBe("High — used by many modules");
    expect(impactLabel(7)).toBe("Moderate — multiple callers");
    expect(impactLabel(2)).toBe("Low");
  });

  it("complexityLabel returns correct severity", () => {
    expect(complexityLabel(20)).toBe("Very complex — many dependencies");
    expect(complexityLabel(12)).toBe("Complex — many dependencies");
    expect(complexityLabel(6)).toBe("Moderate complexity");
    expect(complexityLabel(2)).toBe("Simple");
  });
});
