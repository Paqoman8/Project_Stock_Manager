/// <reference types="jest" />

import { parseFlexibleDateRange, parseAmountSearch } from '../utils/pagination';

describe('parseFlexibleDateRange', () => {
  it('parses DD/MM/YYYY into a full day range', () => {
    const range = parseFlexibleDateRange('29/06/2026');
    expect(range).not.toBeNull();
    expect(range!.gte.getFullYear()).toBe(2026);
    expect(range!.gte.getMonth()).toBe(5);
    expect(range!.gte.getDate()).toBe(29);
    expect(range!.gte.getHours()).toBe(0);
    expect(range!.lte.getHours()).toBe(23);
  });

  it('parses DD-MM-YYYY into a full day range', () => {
    const range = parseFlexibleDateRange('15-01-2025');
    expect(range).not.toBeNull();
    expect(range!.gte.getFullYear()).toBe(2025);
    expect(range!.gte.getMonth()).toBe(0);
    expect(range!.gte.getDate()).toBe(15);
  });

  it('parses MM/YYYY into a full month range', () => {
    const range = parseFlexibleDateRange('06/2026');
    expect(range).not.toBeNull();
    expect(range!.gte.getFullYear()).toBe(2026);
    expect(range!.gte.getMonth()).toBe(5);
    expect(range!.gte.getDate()).toBe(1);
    expect(range!.lte.getMonth()).toBe(5);
    expect(range!.lte.getDate()).toBe(30);
  });

  it('parses YYYY into a full year range', () => {
    const range = parseFlexibleDateRange('2026');
    expect(range).not.toBeNull();
    expect(range!.gte.getFullYear()).toBe(2026);
    expect(range!.gte.getMonth()).toBe(0);
    expect(range!.lte.getMonth()).toBe(11);
    expect(range!.lte.getDate()).toBe(31);
  });

  it('returns null for non-date strings', () => {
    expect(parseFlexibleDateRange('hello')).toBeNull();
    expect(parseFlexibleDateRange('')).toBeNull();
  });

  it('returns null for invalid calendar dates', () => {
    expect(parseFlexibleDateRange('32/13/2026')).toBeNull();
    expect(parseFlexibleDateRange('00/06/2026')).toBeNull();
  });
});

describe('parseAmountSearch', () => {
  it('parses plain integer amounts', () => {
    expect(parseAmountSearch('2200')).toBe(2200);
  });

  it('parses French-formatted amounts with space separators', () => {
    expect(parseAmountSearch('2 200')).toBe(2200);
  });

  it('parses French decimal amounts', () => {
    expect(parseAmountSearch('2,20')).toBe(2.2);
  });

  it('returns null for non-numeric strings', () => {
    expect(parseAmountSearch('abc')).toBeNull();
  });
});
