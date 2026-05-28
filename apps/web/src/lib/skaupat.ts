export const SKAUPAT_TAB_NAME = "hovimestari-skaupat";

export const skaupatSearchUrl = (ingredientName: string): string => {
  const params = new URLSearchParams({ queryString: ingredientName });
  return `https://www.s-kaupat.fi/hakutulokset?${params.toString()}`;
};
