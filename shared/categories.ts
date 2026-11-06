import { isTypoOf, normalizeText } from "./search";

/**
 * Curated category tree. Listings store `path` in the indexed `categoryPath` attribute,
 * so a whole branch is one Arkiv `startsWith` query. `terms` are the words buyers type;
 * multi-word terms ("toy dog") are phrases that win over single-word matching.
 */
export interface CategoryNode {
  path: string;
  label: string;
  terms: readonly string[];
}

export const CATEGORIES: readonly CategoryNode[] = [
  { path: "electronics", label: "Electronics", terms: ["electronics", "electronic", "gadget", "gadgets"] },
  { path: "electronics/phones", label: "Phones", terms: ["phone", "phones", "mobile", "mobiles", "smartphone", "iphone", "android"] },
  { path: "electronics/computers", label: "Computers", terms: ["computer", "computers", "pc", "desktop"] },
  { path: "electronics/computers/laptops", label: "Laptops", terms: ["laptop", "laptops", "notebook", "macbook", "thinkpad", "chromebook"] },
  { path: "electronics/computers/accessories", label: "Computer accessories", terms: ["keyboard", "mouse", "monitor", "charger", "adapter"] },
  { path: "electronics/audio", label: "Audio", terms: ["headphone", "headphones", "earphones", "earbuds", "speaker", "speakers", "airpods"] },
  { path: "electronics/cameras", label: "Cameras", terms: ["camera", "cameras", "dslr", "lens", "gopro"] },
  { path: "electronics/gaming", label: "Gaming", terms: ["console", "playstation", "ps5", "xbox", "nintendo", "controller"] },
  { path: "electronics/tvs", label: "TVs", terms: ["tv", "tvs", "television"] },

  { path: "vehicles", label: "Vehicles", terms: ["vehicle", "vehicles"] },
  { path: "vehicles/cars", label: "Cars", terms: ["car", "cars", "sedan", "hatchback", "suv"] },
  { path: "vehicles/motorcycles", label: "Motorcycles & scooters", terms: ["bike", "motorcycle", "motorbike", "scooter", "scooty"] },
  { path: "vehicles/bicycles", label: "Bicycles", terms: ["bicycle", "bicycles", "cycle", "cycles"] },

  { path: "furniture", label: "Furniture", terms: ["furniture"] },
  { path: "furniture/tables", label: "Tables & desks", terms: ["table", "tables", "desk", "desks"] },
  { path: "furniture/seating", label: "Chairs & sofas", terms: ["chair", "chairs", "sofa", "sofas", "couch", "stool"] },
  { path: "furniture/beds", label: "Beds & mattresses", terms: ["bed", "beds", "mattress", "cot"] },
  { path: "furniture/storage", label: "Storage", terms: ["cupboard", "wardrobe", "shelf", "shelves", "bookshelf", "drawer"] },

  { path: "books", label: "Books", terms: ["book", "books", "novel", "novels", "textbook", "textbooks", "comic", "comics"] },

  { path: "fashion", label: "Fashion", terms: ["fashion", "clothes", "clothing"] },
  { path: "fashion/footwear", label: "Footwear", terms: ["shoe", "shoes", "sneaker", "sneakers", "sandals", "boots"] },
  { path: "fashion/bags", label: "Bags", terms: ["bag", "bags", "backpack", "handbag", "wallet"] },
  { path: "fashion/watches", label: "Watches", terms: ["watch", "watches", "smartwatch"] },

  { path: "pets", label: "Pets", terms: ["pet", "pets"] },
  { path: "pets/dogs", label: "Dogs", terms: ["dog", "dogs", "puppy", "puppies", "canine"] },
  { path: "pets/dogs/toys", label: "Toys", terms: ["toy", "toys", "chew", "squeaky", "squeaker"] },
  { path: "pets/dogs/beds", label: "Beds", terms: ["bed", "beds", "cushion"] },
  { path: "pets/dogs/accessories", label: "Collars & leashes", terms: ["collar", "leash", "harness"] },
  { path: "pets/cats", label: "Cats", terms: ["cat", "cats", "kitten", "kittens", "feline"] },
  { path: "pets/cats/toys", label: "Toys", terms: ["toy", "toys", "scratcher"] },
  { path: "pets/cats/beds", label: "Beds", terms: ["bed", "beds"] },

  { path: "kids", label: "Kids", terms: ["kid", "kids", "baby", "child", "children"] },
  { path: "kids/toys", label: "Toys", terms: ["toy", "toys", "lego", "puzzle"] },
  { path: "kids/toys/stuffed-animals", label: "Stuffed animals", terms: ["toy dog", "toy cat", "stuffed animal", "teddy", "teddy bear", "plush"] },

  { path: "home", label: "Home & kitchen", terms: ["home", "kitchen", "appliance", "appliances"] },
  { path: "sports", label: "Sports & fitness", terms: ["sports", "fitness", "gym", "cricket", "football", "dumbbell", "treadmill"] },
  { path: "other", label: "Other", terms: [] },
];

const byPath = new Map(CATEGORIES.map((node) => [node.path, node]));

export function isCategoryPath(path: string): boolean {
  return byPath.has(path);
}

/** "pets/dogs/toys" → ["pets", "pets/dogs", "pets/dogs/toys"]. */
export function categoryAncestors(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

/** "Pets › Dogs › Toys"; unknown paths from other writers are shown as stored. */
export function categoryLabel(path: string): string {
  if (!byPath.has(path)) return path;
  return categoryAncestors(path).map((ancestor) => byPath.get(ancestor)?.label ?? ancestor).join(" › ");
}

export function parentCategory(path: string): string | undefined {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : undefined;
}

export interface ResolvedQuery {
  /** Most specific matching categories; several when the query is ambiguous ("toy"). */
  categoryPaths: string[];
  /** Normalized words that did not identify a category; matched against listing text. */
  textWords: string[];
  /** Category words as understood, after spacing/typo correction ("dgo toy" → ["dog", "toy"]). */
  recognized: string[];
  corrected: boolean;
}

const singleTerms = new Map<string, string[]>();
const phraseTerms: { phrase: string; path: string }[] = [];
for (const node of CATEGORIES) {
  for (const term of node.terms) {
    const normalized = normalizeText(term);
    if (normalized.includes(" ")) phraseTerms.push({ phrase: normalized, path: node.path });
    else singleTerms.set(normalized, [...(singleTerms.get(normalized) ?? []), node.path]);
  }
}
const knownTerms = [...singleTerms.keys()];

function recognizeWord(word: string): { terms: string[]; corrected: boolean } | null {
  if (singleTerms.has(word)) return { terms: [word], corrected: false };
  // Run-together words: "dogtoy" → "dog" + "toy".
  for (let split = 2; split <= word.length - 2; split++) {
    const head = word.slice(0, split), tail = word.slice(split);
    if (singleTerms.has(head) && singleTerms.has(tail)) return { terms: [head, tail], corrected: true };
  }
  const typo = knownTerms.find((term) => isTypoOf(word, term));
  return typo ? { terms: [typo], corrected: true } : null;
}

/** Keep only the most specific paths: drop any path that is an ancestor of another. */
function mostSpecific(paths: string[]): string[] {
  const unique = [...new Set(paths)];
  return unique.filter((path) => !unique.some((other) => other !== path && other.startsWith(`${path}/`)));
}

/**
 * Turns a buyer query into Arkiv category filters plus leftover text words:
 * "dogtoy" / "dgo toy" → pets/dogs/toys, whereas the phrase "toy dog" → kids/toys/stuffed-animals.
 */
export function resolveQuery(query: string): ResolvedQuery {
  let text = normalizeText(query);
  const phrasePaths: string[] = [];
  for (const { phrase, path } of phraseTerms) {
    if (` ${text} `.includes(` ${phrase} `)) {
      phrasePaths.push(path);
      text = ` ${text} `.replace(` ${phrase} `, " ").trim();
    }
  }
  const recognized: string[] = [];
  const textWords: string[] = [];
  let corrected = false;
  const words = text ? text.split(" ") : [];
  for (let index = 0; index < words.length; index++) {
    // Split words: "lap top" → "laptop".
    const joined = index + 1 < words.length ? words[index] + words[index + 1] : "";
    if (joined && singleTerms.has(joined) && !singleTerms.has(words[index])) {
      recognized.push(joined);
      corrected = true;
      index++;
      continue;
    }
    const match = recognizeWord(words[index]);
    if (match) {
      recognized.push(...match.terms);
      corrected ||= match.corrected;
    } else textWords.push(words[index]);
  }
  if (phrasePaths.length) return { categoryPaths: mostSpecific(phrasePaths), textWords: [...recognized, ...textWords], recognized, corrected };
  if (!recognized.length) return { categoryPaths: [], textWords, recognized, corrected };

  // A category wins by covering the most recognized words along its path ("chew toy for
  // my dog" → pets/dogs/toys covers all three). Ties prefer the last word, the thing bought.
  const head = recognized[recognized.length - 1];
  const scored = [...new Set(recognized.flatMap((term) => singleTerms.get(term) ?? []))].map((path) => {
    const pathTerms = new Set(categoryAncestors(path).flatMap((ancestor) => (byPath.get(ancestor)?.terms ?? []).map(normalizeText)));
    return { path, covered: recognized.filter((term) => pathTerms.has(term)), namesHead: singleTerms.get(head)?.includes(path) ?? false };
  });
  const best = Math.max(...scored.map((candidate) => candidate.covered.length));
  let winners = scored.filter((candidate) => candidate.covered.length === best);
  if (winners.some((candidate) => candidate.namesHead)) winners = winners.filter((candidate) => candidate.namesHead);
  const covered = new Set(winners.flatMap((candidate) => candidate.covered));
  return {
    categoryPaths: mostSpecific(winners.map((candidate) => candidate.path)),
    textWords: [...recognized.filter((term) => !covered.has(term)), ...textWords],
    recognized,
    corrected,
  };
}

/** Category suggestion for a seller's title, e.g. "Rubber chew toy for my dog". */
export function suggestCategory(title: string): string | undefined {
  const { categoryPaths } = resolveQuery(title);
  return categoryPaths.length === 1 ? categoryPaths[0] : undefined;
}
