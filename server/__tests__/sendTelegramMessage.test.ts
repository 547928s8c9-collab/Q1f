import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "../telegram/sendMessage";

describe("sendTelegramMessage", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    vi.restoreAllMocks();
  });

  it("sends successfully on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramMessage("tg-1", "hello");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 using retry_after", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({ parameters: { retry_after: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(),
      });

    vi.stubGlobal("fetch", fetchMock);

    const promise = sendTelegramMessage("tg-1", "hello");
    await vi.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("retries on 500 and fails after max attempts", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = sendTelegramMessage("tg-1", "hello");
    const rejection = expect(promise).rejects.toThrow("Telegram send failed after retries");
    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });
});
