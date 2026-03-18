export type ReportLanguage = 'EN' | 'ZH';

export interface LearningAnalysisItem {
  category: string;
  description: string;
}

export interface ParsedReport {
  context: string;
  observation: string;
  learningAnalysis: LearningAnalysisItem[];
  raw: string;
  language: ReportLanguage;
}

const SPARK_DOMAINS: Array<{
  en: string;
  zh: string;
  aliases?: string[];
  colors: { bg: string; border: string; dot: string };
}> = [
  {
    en: 'Language & Literacy',
    zh: '语言与读写能力',
    aliases: ['Language and Literacy'],
    colors: { bg: '#EEF6FF', border: '#7EB8E8', dot: '#4A90D9' },
  },
  {
    en: 'Creative Expression',
    zh: '创意表达',
    colors: { bg: '#FDF0FF', border: '#C47EE8', dot: '#A044D4' },
  },
  {
    en: 'Cultural Awareness',
    zh: '文化认知',
    colors: { bg: '#FFF3EC', border: '#F4A46A', dot: '#E8845A' },
  },
  {
    en: 'Collaboration & Social Skills',
    zh: '协作与社交能力',
    aliases: ['Collaboration and Social Skills'],
    colors: { bg: '#F0FFF4', border: '#68C98A', dot: '#38A05C' },
  },
  {
    en: 'Cognitive Development',
    zh: '认知发展',
    colors: { bg: '#FFF8EC', border: '#E8C86A', dot: '#D4A017' },
  },
  {
    en: 'Fine Motor & Design Thinking',
    zh: '精细动作与设计思维',
    aliases: ['Fine Motor and Design Thinking'],
    colors: { bg: '#FFE8EE', border: '#E87E9E', dot: '#D44A6A' },
  },
];

export const REPORT_SECTION_LABELS: Record<ReportLanguage, { context: string; observation: string; analysis: string }> = {
  EN: {
    context: 'CONTEXT',
    observation: 'OBSERVATION',
    analysis: 'LEARNING ANALYSIS',
  },
  ZH: {
    context: '情境',
    observation: '观察记录',
    analysis: '学习分析',
  },
};

const SECTION_ALIASES = {
  context: ['CONTEXT', '情境', '活动背景'],
  observation: ['OBSERVATION', '观察记录', '观察'],
  analysis: ['LEARNING ANALYSIS', '学习分析', 'SPARK学习分析'],
};

const ZH_CATEGORY_SET = new Set(SPARK_DOMAINS.map((domain) => domain.zh));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCategoryLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[：:]/g, '')
    .replace(/[&]/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColonIndex(value: string): number {
  const asciiIdx = value.indexOf(':');
  const zhIdx = value.indexOf('：');
  if (asciiIdx < 0) return zhIdx;
  if (zhIdx < 0) return asciiIdx;
  return Math.min(asciiIdx, zhIdx);
}

function stripLeadingMarkers(line: string): string {
  return line.replace(/^[\s\-*•\d.)]+/, '');
}

function matchCategory(line: string): string | null {
  const normalized = normalizeCategoryLabel(stripLeadingMarkers(line).replace(/[：:]$/, ''));
  const hasCjk = /[\u4e00-\u9fff]/.test(line);

  for (const domain of SPARK_DOMAINS) {
    const candidates = [domain.en, domain.zh, ...(domain.aliases || [])];
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeCategoryLabel(candidate);
      if (normalized.startsWith(normalizedCandidate)) {
        return hasCjk ? domain.zh : domain.en;
      }
    }
  }

  return null;
}

function extractSection(text: string, startLabels: string[], endLabels: string[]): string {
  const startPattern = `(?:${startLabels.map(escapeRegExp).join('|')})\\s*[:：]\\s*\\n`;
  const endPattern = endLabels.length > 0
    ? `(?=\\n(?:${endLabels.map(escapeRegExp).join('|')})\\s*[:：]|$)`
    : '$';
  const regex = new RegExp(`${startPattern}([\\s\\S]*?)${endPattern}`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() || '';
}

function detectReportLanguage(raw: string, learningAnalysis: LearningAnalysisItem[]): ReportLanguage {
  if (/(?:^|\n)\s*(?:情境|观察记录|学习分析)\s*[:：]/.test(raw)) {
    return 'ZH';
  }

  if (learningAnalysis.some((item) => ZH_CATEGORY_SET.has(item.category))) {
    return 'ZH';
  }

  const cjkCount = raw.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return cjkCount >= 12 ? 'ZH' : 'EN';
}

export const CATEGORY_COLORS: Record<string, { bg: string; border: string; dot: string }> = Object.fromEntries(
  SPARK_DOMAINS.flatMap((domain) => [
    [domain.en, domain.colors],
    [domain.zh, domain.colors],
  ]),
);

export function parseReport(raw: string): ParsedReport {
  const result: ParsedReport = {
    context: '',
    observation: '',
    learningAnalysis: [],
    raw,
    language: 'EN',
  };

  const cleaned = raw.replace(/^---\s*/gm, '').replace(/\s*---$/gm, '');

  result.context = extractSection(cleaned, SECTION_ALIASES.context, SECTION_ALIASES.observation);
  result.observation = extractSection(cleaned, SECTION_ALIASES.observation, SECTION_ALIASES.analysis);

  const analysisText = extractSection(cleaned, SECTION_ALIASES.analysis, []);
  if (!analysisText) {
    result.language = detectReportLanguage(cleaned, result.learningAnalysis);
    return result;
  }

  const lines = analysisText.split('\n');
  let currentCategory: string | null = null;
  let currentDescription = '';

  for (const line of lines) {
    const trimmed = stripLeadingMarkers(line.trim());
    if (!trimmed) continue;

    const category = matchCategory(trimmed);
    if (category) {
      if (currentCategory && currentDescription) {
        result.learningAnalysis.push({
          category: currentCategory,
          description: currentDescription,
        });
      }

      currentCategory = category;
      const colonIdx = findColonIndex(trimmed);
      currentDescription = colonIdx >= 0 ? trimmed.slice(colonIdx + 1).trim() : '';
      continue;
    }

    if (currentCategory) {
      currentDescription = currentDescription
        ? `${currentDescription} ${trimmed}`
        : trimmed;
    }
  }

  if (currentCategory && currentDescription) {
    result.learningAnalysis.push({
      category: currentCategory,
      description: currentDescription,
    });
  }

  result.language = detectReportLanguage(cleaned, result.learningAnalysis);
  return result;
}
