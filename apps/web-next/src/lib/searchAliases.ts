// Search aliases for common abbreviations and nicknames
// Maps search terms to bank/card name patterns they should match

const bankAliases: Record<string, string[]> = {
  'amex': ['american express'],
  'bofa': ['bank of america'],
  'boa': ['bank of america'],
  'csp': ['chase sapphire preferred'],
  'csr': ['chase sapphire reserve'],
  'cfu': ['chase freedom unlimited'],
  'cff': ['chase freedom flex'],
  'wf': ['wells fargo'],
  'usb': ['u.s. bank', 'us bank'],
  'cap one': ['capital one'],
  'capone': ['capital one'],
};

/**
 * Expands a search term to include aliases
 * Returns an array of terms to search for
 */
export function expandSearchTerm(term: string): string[] {
  const lowerTerm = term.toLowerCase();
  const terms = [lowerTerm];

  // Check if the search term matches any alias
  for (const [alias, expansions] of Object.entries(bankAliases)) {
    if (lowerTerm.includes(alias)) {
      terms.push(...expansions);
    }
  }

  return terms;
}

/**
 * Check if a card matches the search input, including aliases
 */
export function cardMatchesSearch(
  cardName: string,
  bank: string,
  searchInput: string
): boolean {
  if (!searchInput) return true;

  const searchTerms = expandSearchTerm(searchInput);
  const lowerCardName = cardName.toLowerCase();
  const lowerBank = bank.toLowerCase();

  return searchTerms.some(term =>
    lowerCardName.includes(term) || lowerBank.includes(term)
  );
}
