// src/utils/pagination.ts
//
// Shared helpers for paginated list endpoints.
// Includes flexible parsing of free-text search terms into date ranges or
// numeric amounts so controllers can stay thin and repositories can build
// Prisma where clauses in a consistent way.

/**
 * Parses a free-text search term into a day/month/year date range.
 *
 * Supported French-style formats:
 *   - DD/MM/YYYY or DD-MM-YYYY → exact calendar day
 *   - MM/YYYY or MM-YYYY       → exact calendar month
 *   - YYYY                     → exact calendar year
 *   - DD/MM or DD-MM           → that day/month in any year (2000-2099)
 *
 * Returns null when the input is empty or cannot be interpreted as a date.
 */
export function parseFlexibleDateRange(search: string): { gte: Date; lte: Date } | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const fullDateMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (fullDateMatch) {
    const day = parseInt(fullDateMatch[1], 10);
    const month = parseInt(fullDateMatch[2], 10);
    const year = parseInt(fullDateMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return {
        gte: new Date(year, month - 1, day, 0, 0, 0),
        lte: new Date(year, month - 1, day, 23, 59, 59, 999),
      };
    }
  }

  // DD/MM or DD-MM → any year in the supported range
  const dayMonthMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})$/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const month = parseInt(dayMonthMatch[2], 10);
    if (isValidDayMonth(day, month)) {
      return {
        gte: new Date(2000, month - 1, day, 0, 0, 0),
        lte: new Date(2099, month - 1, day, 23, 59, 59, 999),
      };
    }
  }

  // MM/YYYY or MM-YYYY
  const monthYearMatch = trimmed.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (monthYearMatch) {
    const month = parseInt(monthYearMatch[1], 10);
    const year = parseInt(monthYearMatch[2], 10);
    if (isValidMonthYear(month, year)) {
      return {
        gte: new Date(year, month - 1, 1, 0, 0, 0),
        lte: new Date(year, month, 0, 23, 59, 59, 999),
      };
    }
  }

  // YYYY
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 2000 && year <= 2099) {
      return {
        gte: new Date(year, 0, 1, 0, 0, 0),
        lte: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    }
  }

  return null;
}

/**
 * Parses a free-text search term into a numeric amount.
 *
 * Understands French formatting commonly produced by toLocaleString('fr-FR'):
 * spaces (or non-breaking spaces) as thousands separators and comma as the
 * decimal separator. Returns null when the input cannot be parsed as a number.
 */
export function parseAmountSearch(search: string): number | null {
  const normalized = search
    .replace(/\s/g, '') // thousands / non-breaking spaces
    .replace(/,/g, '.'); // decimal separator
  const value = parseFloat(normalized);
  return Number.isNaN(value) ? null : value;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isValidDayMonth(day: number, month: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isValidMonthYear(month: number, year: number): boolean {
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2099;
}
