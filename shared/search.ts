// Text-matching rules shared by FreshMarket and SECOND LOOK; no app/provider dependencies.

/** Lowercase, Unicode-normalized words separated by single spaces. */
export function normalizeText(value: string): string {
  // Keep combining marks (\p{M}): Devanagari and other Indic vowel signs are marks, not letters.
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

/** normalizeText without spaces, so "Dog-Toy" and "dog toy" compare equal to "dogtoy". */
export function squash(value: string): string {
  return normalizeText(value).replace(/ /g, "");
}

/** Edit distance where swapping two neighbouring letters costs 1 (optimal string alignment). */
export function typoDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Whether a typed word is an acceptable misspelling of a known word. Short words only
 * accept a swap of neighbouring letters ("dgo" → "dog"), so "car" never becomes "cat".
 */
export function isTypoOf(typed: string, known: string): boolean {
  if (typed === known) return true;
  if (typed.length < 3) return false;
  const distance = typoDistance(typed, known);
  if (typed.length <= 4) return distance === 1 && typed.length === known.length && [...typed].sort().join("") === [...known].sort().join("");
  return distance <= (typed.length >= 8 ? 2 : 1);
}

export interface SearchableText {
  title: string;
  description: string;
  brand?: string;
  model?: string;
}

/**
 * 0 = no match; higher = better. Matches ignore spacing ("dogtoy" ↔ "dog toy"),
 * accept prefixes ("lap" → laptop) and tolerate one typo per word ("latpop" → laptop).
 */
export function textMatchScore(item: SearchableText, words: readonly string[]): number {
  if (!words.length) return 1;
  const title = normalizeText(item.title);
  const rest = normalizeText(`${item.description} ${item.brand ?? ""} ${item.model ?? ""}`);
  const phrase = words.join("");
  if (phrase.length >= 3 && title.replace(/ /g, "").includes(phrase)) return 4;
  if (phrase.length >= 3 && rest.replace(/ /g, "").includes(phrase)) return 2;
  const titleWords = title.split(" ");
  const allWords = [...titleWords, ...rest.split(" ")];
  const found = (word: string, pool: string[]) =>
    pool.some((candidate) => candidate.startsWith(word) || isTypoOf(word, candidate));
  if (!words.every((word) => found(word, allWords))) return 0;
  return words.every((word) => found(word, titleWords)) ? 3 : 1;
}
