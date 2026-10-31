import { describe, expect, it } from "vitest";
import { aboutUsd, costUsd, formatUsd } from "@/domain/pricing";
import { addUsage } from "@/domain/updates";
import { summarize } from "@/domain/graph";
import { project } from "./helpers";

describe("pricing", () => {
  it("prices one image at about $0.134", () => {
    const usd = costUsd({ model: "gemini-3-pro-image", calls: 1, inputTokens: 0, outputTokens: 0, imageTokens: 1120 });
    expect(usd).toBeCloseTo(0.1344, 4);
  });

  it("prices text input and output separately", () => {
    const usd = costUsd({ model: "gemini-3.5-flash", calls: 1, inputTokens: 1_000_000, outputTokens: 1_000_000, imageTokens: 0 });
    expect(usd).toBeCloseTo(10.5, 6);
  });

  it("says it doesn't know rather than guessing for an unknown model", () => {
    expect(costUsd({ model: "mystery", calls: 1, inputTokens: 5, outputTokens: 5, imageTokens: 0 })).toBeNull();
  });

  it("formats small amounts readably", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("project usage", () => {
  it("keeps a running total and shows it on the project card", () => {
    let p = project();
    const image = { model: "gemini-3-pro-image", calls: 2, inputTokens: 100, outputTokens: 50, imageTokens: 1120 };
    p = addUsage(addUsage(p, image), image);
    expect(p.usage).toMatchObject({ calls: 4, inputTokens: 200, imageTokens: 2240 });
    expect(summarize(p)).toMatchObject({ calls: 4, costUsd: p.usage!.costUsd });
    expect(p.usage!.costUsd).toBeGreaterThan(0.26);
  });

  it("ignores reports with no calls", () => {
    const p = project();
    expect(addUsage(p, { model: "x", calls: 0, inputTokens: 0, outputTokens: 0, imageTokens: 0 })).toBe(p);
  });
});

describe("aboutUsd", () => {
  it("reads naturally in a sentence", () => {
    expect(aboutUsd(0)).toBe("$0");
    expect(aboutUsd(0.003)).toBe("under $0.01");
    expect(aboutUsd(1.234)).toBe("about $1.23");
  });
});
