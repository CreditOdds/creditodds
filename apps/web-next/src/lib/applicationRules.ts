import { WalletCard } from './api';

export interface RuleResult {
  ruleName: string;
  bank: string;
  current: number;
  limit: number;
  periodDescription: string;
  isSafe: boolean;
}

/**
 * Get cards acquired within a date range
 */
function getCardsInRange(
  cards: WalletCard[],
  months: number,
  bankFilter?: string
): WalletCard[] {
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - months);

  return cards.filter((card) => {
    // Skip cards without acquisition date
    if (!card.acquired_year) return false;

    // Build card date (use month if available, otherwise assume January)
    const cardMonth = card.acquired_month ? card.acquired_month - 1 : 0;
    const cardDate = new Date(card.acquired_year, cardMonth, 1);

    // Check if within range
    if (cardDate < cutoffDate) return false;

    // Apply bank filter if specified
    if (bankFilter) {
      return card.bank.toLowerCase().includes(bankFilter.toLowerCase());
    }

    return true;
  });
}

/**
 * Get cards acquired within a number of days
 */
function getCardsInDays(
  cards: WalletCard[],
  days: number,
  bankFilter?: string
): WalletCard[] {
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return cards.filter((card) => {
    // Skip cards without acquisition date
    if (!card.acquired_year || !card.acquired_month) return false;

    // Build card date (assume 15th of month for day-based calculations)
    const cardDate = new Date(card.acquired_year, card.acquired_month - 1, 15);

    // Check if within range
    if (cardDate < cutoffDate) return false;

    // Apply bank filter if specified
    if (bankFilter) {
      return card.bank.toLowerCase().includes(bankFilter.toLowerCase());
    }

    return true;
  });
}

/**
 * Calculate Chase 5/24 rule
 * 5 new cards (any bank) in 24 months
 */
function calculateChase524(cards: WalletCard[]): RuleResult {
  const cardsIn24Months = getCardsInRange(cards, 24);
  return {
    ruleName: 'Chase 5/24',
    bank: 'Chase',
    current: cardsIn24Months.length,
    limit: 5,
    periodDescription: '24 months',
    isSafe: cardsIn24Months.length < 5,
  };
}

/**
 * Calculate Amex 2/90 rule
 * 2 Amex cards in 90 days
 */
function calculateAmex290(cards: WalletCard[]): RuleResult {
  const amexCardsIn90Days = getCardsInDays(cards, 90, 'american express');
  return {
    ruleName: 'Amex 2/90',
    bank: 'American Express',
    current: amexCardsIn90Days.length,
    limit: 2,
    periodDescription: '90 days',
    isSafe: amexCardsIn90Days.length < 2,
  };
}

/**
 * Calculate Capital One 1/6 rule
 * 1 Capital One card in 6 months
 */
function calculateCapOne16(cards: WalletCard[]): RuleResult {
  const capOneCardsIn6Months = getCardsInRange(cards, 6, 'capital one');
  return {
    ruleName: 'Capital One 1/6',
    bank: 'Capital One',
    current: capOneCardsIn6Months.length,
    limit: 1,
    periodDescription: '6 months',
    isSafe: capOneCardsIn6Months.length < 1,
  };
}

/**
 * Calculate all application rules from wallet cards
 */
export function calculateApplicationRules(cards: WalletCard[]): RuleResult[] {
  return [
    calculateChase524(cards),
    calculateAmex290(cards),
    calculateCapOne16(cards),
  ];
}

/**
 * Count cards missing acquisition dates
 */
export function countCardsMissingDates(cards: WalletCard[]): number {
  return cards.filter((card) => !card.acquired_year).length;
}
