import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { AddressStatus } from "@shared/schema";
import { registerSecurityRoutes } from "../routes/security";
import { storage } from "../storage";

vi.mock("../storage", () => ({
  storage: {
    getSecuritySettings: vi.fn(),
    createWhitelistAddress: vi.fn(),
    getTwoFactor: vi.fn(),
  },
}));

describe("security whitelist routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a whitelist address with normalized status", async () => {
    const app = express();
    app.use(express.json());

    const mockStorage = storage as unknown as {
      getSecuritySettings: ReturnType<typeof vi.fn>;
      createWhitelistAddress: ReturnType<typeof vi.fn>;
      getTwoFactor: ReturnType<typeof vi.fn>;
    };

    mockStorage.getSecuritySettings.mockResolvedValue({ addressDelay: 0 });
    mockStorage.getTwoFactor.mockResolvedValue({ enabled: false });
    mockStorage.createWhitelistAddress.mockResolvedValue({ id: "addr-1" });

    registerSecurityRoutes({
      app,
      isAuthenticated: (req, _res, next) => {
        (req as any).user = { id: "user-1", claims: { sub: "user-1" } };
        next();
      },
      getUserId: () => "user-1",
    });

    const res = await request(app)
      .post("/api/security/whitelist/add")
      .send({ address: "T".padEnd(34, "1"), label: "  Main Wallet  " });

    expect(res.status).toBe(200);
    expect(mockStorage.createWhitelistAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        status: AddressStatus.ACTIVE,
        label: "Main Wallet",
      }),
    );
  });
});
