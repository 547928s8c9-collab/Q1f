export interface CalibrationOptions {
  windowDays?: number;
  profiles?: string[];
  dryRun?: boolean;
}

export interface CalibrationReport {
  summary: {
    total: number;
    updated: number;
    skipped: number;
    dryRun: boolean;
  };
  perProfile: Array<{
    profileId: string;
    status: "updated" | "skipped" | "error";
    message?: string;
  }>;
}

export async function calibrateAllProfiles(
  _options?: CalibrationOptions
): Promise<CalibrationReport> {
  return {
    summary: { total: 0, updated: 0, skipped: 0, dryRun: _options?.dryRun ?? false },
    perProfile: [],
  };
}
