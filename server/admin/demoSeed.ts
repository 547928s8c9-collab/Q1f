export interface SeedResult {
  seeded: boolean;
  counts: Record<string, number>;
}

export async function seedAdminDemoData(params: { adminUserId: string }): Promise<SeedResult> {
  return {
    seeded: false,
    counts: {},
  };
}
