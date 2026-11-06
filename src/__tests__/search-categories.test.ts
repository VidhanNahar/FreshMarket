import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryLabel, isCategoryPath, parentCategory, resolveQuery, suggestCategory } from "../../shared/categories";
import { isTypoOf, normalizeText, squash, textMatchScore, typoDistance } from "../../shared/search";

describe("text normalization and typo tolerance", () => {
  it("normalizes case, punctuation and spacing", () => {
    expect(normalizeText("  Dog-Toy!! ")).toBe("dog toy");
    expect(squash("Dog Toy")).toBe(squash("dogtoy"));
    // Indic vowel signs are combining marks and must survive normalization.
    expect(squash("सैमसंग")).toBe("सैमसंग");
    expect(squash("सैमसंग")).not.toBe(squash("समसग"));
  });
  it("counts a swap of neighbouring letters as one typo", () => {
    expect(typoDistance("latpop", "laptop")).toBe(1);
    expect(isTypoOf("latpop", "laptop")).toBe(true);
    expect(isTypoOf("dgo", "dog")).toBe(true);
    // Short words only accept swaps, so a real word never becomes a different one.
    expect(isTypoOf("car", "cat")).toBe(false);
    expect(isTypoOf("laptop", "desktop")).toBe(false);
  });
  it("scores title, description, prefix and typo matches", () => {
    const item = { title: "Red Dog Toy Ball", description: "barely used", brand: "acme", model: "" };
    expect(textMatchScore(item, ["dogtoy"])).toBe(4);
    expect(textMatchScore(item, ["barely"])).toBe(2);
    // Words found separately in the title (not as one squashed phrase), one with a typo.
    expect(textMatchScore(item, ["bal", "rde"])).toBe(3);
    expect(textMatchScore(item, ["acme"])).toBe(2);
    expect(textMatchScore(item, ["purple"])).toBe(0);
    expect(textMatchScore(item, [])).toBe(1);
  });
});

describe("category tree", () => {
  it("has unique paths whose parents exist", () => {
    const paths = CATEGORIES.map((node) => node.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      const parent = parentCategory(path);
      if (parent) expect(isCategoryPath(parent)).toBe(true);
    }
  });
  it("labels paths for display", () => {
    expect(categoryLabel("pets/dogs/toys")).toBe("Pets › Dogs › Toys");
    expect(categoryLabel("made/up")).toBe("made/up");
  });
});

describe("query understanding", () => {
  it.each([
    ["dogtoy", ["pets/dogs/toys"]],
    ["dog toy", ["pets/dogs/toys"]],
    ["dog toys", ["pets/dogs/toys"]],
    ["toys for dogs", ["pets/dogs/toys"]],
    ["dgo toy", ["pets/dogs/toys"]],
    ["latpop", ["electronics/computers/laptops"]],
    ["lap top", ["electronics/computers/laptops"]],
    ["toy dog", ["kids/toys/stuffed-animals"]],
    ["dog bed", ["pets/dogs/beds"]],
  ])("%s → %j", (query, paths) => {
    expect(resolveQuery(query).categoryPaths).toEqual(paths);
  });
  it("returns every matching branch for an ambiguous word", () => {
    expect(resolveQuery("toy").categoryPaths.sort()).toEqual(["kids/toys", "pets/cats/toys", "pets/dogs/toys"]);
  });
  it("keeps unrecognized words as text and reports corrections", () => {
    expect(resolveQuery("red dogtoy")).toMatchObject({ categoryPaths: ["pets/dogs/toys"], textWords: ["red"], recognized: ["dog", "toy"], corrected: true });
    expect(resolveQuery("iphone 13")).toMatchObject({ categoryPaths: ["electronics/phones"], textWords: ["13"], corrected: false });
    expect(resolveQuery("kong")).toMatchObject({ categoryPaths: [], textWords: ["kong"] });
    expect(resolveQuery("")).toMatchObject({ categoryPaths: [], textWords: [] });
  });
  it("suggests a category from a seller's title", () => {
    expect(suggestCategory("Rubber chew toy for my dog")).toBe("pets/dogs/toys");
    expect(suggestCategory("Lenovo ThinkPad T14 laptop")).toBe("electronics/computers/laptops");
    expect(suggestCategory("Assorted items")).toBeUndefined();
  });
});
