import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomNav } from "../components/BottomNav";
import { SparklineSVG } from "../components/SparklineSVG";

describe("TG v2 UI", () => {
  it("renders bottom tabs", () => {
    const html = renderToString(<BottomNav active="overview" onChange={() => undefined} />);
    expect(html).toContain("Обзор");
    expect(html).toContain("Стратегии");
    expect(html).toContain("Активность");
  });

  it("renders sparkline svg", () => {
    const html = renderToString(<SparklineSVG points={[1, 2, 3, 2]} />);
    expect(html).toContain("svg");
    expect(html).toContain("path");
  });
});
