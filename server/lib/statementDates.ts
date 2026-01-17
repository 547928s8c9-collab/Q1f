export interface StatementDateRange {
  startDate: Date;
  endDate: Date;
  year: number;
  month: number;
}

export function getStatementDateRange(year: number, month: number): StatementDateRange {
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startDate, endDate, year, month };
}

export function isValidStatementMonth(year: number, month: number): boolean {
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (year > currentYear) return false;
  if (year === currentYear && month > currentMonth) return false;
  if (year < 2020) return false;
  return true;
}
