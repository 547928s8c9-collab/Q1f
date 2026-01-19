import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiRequest } from "./queryClient";

describe("apiRequest", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("merges custom headers with content type", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await apiRequest(
      "POST",
      "/api/deposit/usdt/simulate",
      { amount: "1000000" },
      { headers: { "Idempotency-Key": "dep_test_123" } },
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": "dep_test_123",
    });
    expect(init?.credentials).toBe("include");
  });
});
