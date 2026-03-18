import { describe, expect, it } from "vitest";
import { parseReport } from "@/frontend/lib/parseReport";

describe("parseReport", () => {
  it("parses English sections and categories", () => {
    const raw = `
CONTEXT:
Children are building habitats with recycled materials.

OBSERVATION:
Aisyah arranged cardboard pieces and explained her plan to a peer.

LEARNING ANALYSIS:

Language & Literacy: Aisyah used sequencing words to explain the build process.

Creative Expression: Aisyah chose original decorations and refined her design.
`;

    const parsed = parseReport(raw);

    expect(parsed.language).toBe("EN");
    expect(parsed.context).toContain("building habitats");
    expect(parsed.observation).toContain("Aisyah arranged");
    expect(parsed.learningAnalysis).toHaveLength(2);
    expect(parsed.learningAnalysis[0].category).toBe("Language & Literacy");
  });

  it("parses Mandarin sections with SPARK labels", () => {
    const raw = `
情境:
孩子们正在合作搭建社区模型。

观察记录:
子晴先观察材料，再主动分配纸片给同伴，并说明自己的想法。

学习分析:

语言与读写能力: 子晴用清楚的词句描述步骤，并回应同伴提问。

协作与社交能力: 子晴倾听同伴意见后调整分工，展现合作能力。
`;

    const parsed = parseReport(raw);

    expect(parsed.language).toBe("ZH");
    expect(parsed.context).toContain("社区模型");
    expect(parsed.observation).toContain("子晴");
    expect(parsed.learningAnalysis).toHaveLength(2);
    expect(parsed.learningAnalysis[0].category).toBe("语言与读写能力");
    expect(parsed.learningAnalysis[1].category).toBe("协作与社交能力");
  });

  it("supports full-width colon and mixed category text", () => {
    const raw = `
学习分析：

认知发展： 孩子比较了不同材料的稳定性并做出调整。

Fine Motor & Design Thinking: She carefully folded and aligned edges.
`;

    const parsed = parseReport(raw);

    expect(parsed.learningAnalysis).toHaveLength(2);
    expect(parsed.learningAnalysis[0].category).toBe("认知发展");
    expect(parsed.learningAnalysis[1].category).toBe("Fine Motor & Design Thinking");
  });
});
