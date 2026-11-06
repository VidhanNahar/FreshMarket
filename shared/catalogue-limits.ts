/** Prototype readers must not scan an unbounded public namespace on every refresh. */
export const MAX_CATALOGUE_MATCHES = 10_000;
export const CATALOGUE_READ_BUDGET_MS = 60_000;
export class CatalogueReadLimitError extends Error {
  constructor() { super("Catalogue read limit reached. Narrow the category or city and try again."); this.name = "CatalogueReadLimitError"; }
}
