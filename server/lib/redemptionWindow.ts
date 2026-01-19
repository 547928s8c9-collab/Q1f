// Helper function to calculate next weekly window (Sunday 00:00 UTC)
export function getNextWeeklyWindow(now: Date = new Date()): Date {
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7; // next Sunday
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(0, 0, 0, 0);
  return nextSunday;
}
