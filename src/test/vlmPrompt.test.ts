import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/backend/services/vlm";

describe("buildSystemPrompt", () => {
  it("supports English template headings", () => {
    const prompt = buildSystemPrompt("Aisyah", "Habitat design activity", undefined, "EN");

    expect(prompt).toContain("CONTEXT:");
    expect(prompt).toContain("OBSERVATION:");
    expect(prompt).toContain("LEARNING ANALYSIS:");
    expect(prompt).toContain("Language & Literacy:");
  });

  it("supports Mandarin template headings and SPARK labels", () => {
    const prompt = buildSystemPrompt("子晴", "孩子们在进行建构活动", undefined, "ZH");

    expect(prompt).toContain("情境:");
    expect(prompt).toContain("观察记录:");
    expect(prompt).toContain("学习分析:");
    expect(prompt).toContain("语言与读写能力:");
    expect(prompt).toContain("精细动作与设计思维:");
  });
});
