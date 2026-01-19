import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TelegramMiniApp, { getTelegramMiniAppState } from "@/pages/tg";

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement("a", null, children),
}));

describe("TelegramMiniApp", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow) {
      (globalThis as typeof globalThis & { window: Window }).window = originalWindow;
    } else {
      delete (globalThis as typeof globalThis & { window?: Window }).window;
    }
  });

  it("renders the Telegram prompt when WebApp is unavailable", () => {
    (globalThis as typeof globalThis & { window: Window }).window = {} as Window;
    const html = renderToStaticMarkup(React.createElement(TelegramMiniApp));
    expect(html).toContain("Откройте эту страницу внутри Telegram");
    expect(html).toContain("Назад на сайт");
  });

  it("derives view state from Telegram availability", () => {
    expect(getTelegramMiniAppState(false, "unauthorized")).toBe("not-in-telegram");
    expect(getTelegramMiniAppState(true, "unauthorized")).toBe("unauthorized");
    expect(getTelegramMiniAppState(true, "authorized")).toBe("authorized");
  });

  it("renders the connected state when Telegram WebApp is available", () => {
    (globalThis as typeof globalThis & { window: Window }).window = {
      Telegram: {
        WebApp: {
          ready: () => undefined,
        },
      },
    } as Window;

    const html = renderToStaticMarkup(React.createElement(TelegramMiniApp));
    expect(html).toContain("Telegram app connected");
    expect(html).toContain("Connected, waiting for auth");
  });
});
