import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { requireTwoFactor } from "../middleware/requireTwoFactor";
import { storage } from "../storage";
import { decryptSecret, isTwoFactorAvailable } from "../lib/twofactorCrypto";
import { verify } from "otplib";

vi.mock("../storage", () => ({
  storage: {
    getTwoFactor: vi.fn(),
  },
}));

vi.mock("../lib/twofactorCrypto", () => ({
  decryptSecret: vi.fn(),
  isTwoFactorAvailable: vi.fn(),
}));

vi.mock("otplib", () => ({
  verify: vi.fn(),
}));

const mockRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe("requireTwoFactor middleware", () => {
  const mockedStorage = storage as unknown as { getTwoFactor: ReturnType<typeof vi.fn> };
  const mockedIsAvailable = isTwoFactorAvailable as unknown as ReturnType<typeof vi.fn>;
  const mockedDecrypt = decryptSecret as unknown as ReturnType<typeof vi.fn>;
  const mockedVerify = verify as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsAvailable.mockReturnValue(true);
  });

  it("allows requests when 2FA is not enabled", async () => {
    mockedStorage.getTwoFactor.mockResolvedValue(null);
    const req = { user: { id: "user-1" } } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireTwoFactor(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects when 2FA is enabled but no code provided", async () => {
    mockedStorage.getTwoFactor.mockResolvedValue({ enabled: true, secretEncrypted: "enc" });
    const req = { user: { id: "user-1" }, headers: {}, body: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireTwoFactor(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: "TWO_FACTOR_REQUIRED",
      error: "Two-factor authentication code is required for this operation",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid code formats", async () => {
    mockedStorage.getTwoFactor.mockResolvedValue({ enabled: true, secretEncrypted: "enc" });
    const req = { user: { id: "user-1" }, headers: { "x-2fa-code": "12345" }, body: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireTwoFactor(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: "TWO_FACTOR_INVALID",
      error: "Invalid 2FA code format. Must be 6 digits.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts valid codes and continues", async () => {
    mockedStorage.getTwoFactor.mockResolvedValue({ enabled: true, secretEncrypted: "enc" });
    mockedDecrypt.mockReturnValue("secret");
    mockedVerify.mockReturnValue(true);

    const req = { user: { id: "user-1" }, headers: { "x-2fa-code": "123456" }, body: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireTwoFactor(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireTwoFactor integration", () => {
  const mockedStorage = storage as unknown as { getTwoFactor: ReturnType<typeof vi.fn> };
  const mockedIsAvailable = isTwoFactorAvailable as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsAvailable.mockReturnValue(true);
  });

  it("blocks protected routes without code", async () => {
    mockedStorage.getTwoFactor.mockResolvedValue({ enabled: true, secretEncrypted: "enc" });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: "user-1" };
      next();
    });

    app.post("/secure-action", requireTwoFactor, (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).post("/secure-action");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: "TWO_FACTOR_REQUIRED",
      error: "Two-factor authentication code is required for this operation",
    });
  });
});
