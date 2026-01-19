import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TelegramMiniApp from "@/pages/tg";

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
    expect(html).toContain("Требуется Telegram WebApp");
    expect(html).toContain("Назад на сайт");
  });

  it("renders the authenticating state when Telegram WebApp is available", () => {
    (globalThis as typeof globalThis & { window: Window }).window = {
      Telegram: {
        WebApp: {
          initData: "init-data",
          ready: () => undefined,
        },
      },
    } as Window;

    const html = renderToStaticMarkup(React.createElement(TelegramMiniApp));
    expect(html).toContain("Проверяем доступ");
  });
});
