/**
 * Vision Language Model Service
 * Supports multiple VLM backends:
 * 1. OpenAI GPT-4 Vision (recommended, uses env variable)
 * 2. Hugging Face Inference API (cloud, free tier available)
 * 3. Ollama (local, requires installation)
 * 4. OpenRouter (cloud, pay-per-use, access to many models)
 * 5. Colab Tunnel (custom Flask endpoint on Google Colab)
 */

import { parseReport, REPORT_SECTION_LABELS } from '@/frontend/lib/parseReport';

export type VLMProvider = 'colab' | 'openai' | 'huggingface' | 'ollama' | 'openrouter';
export type ReportLanguage = 'EN' | 'ZH';

const DEFAULT_REPORT_LANGUAGE: ReportLanguage = 'EN';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export interface VLMConfig {
  provider: VLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reportLanguage?: ReportLanguage;
  mandarinEncoderModel?: string;
}

// ─── Environment helpers ────────────────────────────────────────────────────

const getColabUrl = (): string | undefined => import.meta.env.VITE_COLAB_URL;
const getEnvApiKey = (): string | undefined => import.meta.env.VITE_OPENAI_API_KEY;
const getEnvOpenRouterApiKey = (): string | undefined => import.meta.env.VITE_OPENROUTER_API_KEY;
const getEnvMandarinEncoderModel = (): string | undefined => import.meta.env.VITE_MANDARIN_ENCODER_MODEL;

const DEFAULT_MANDARIN_ENCODER_MODEL = getEnvMandarinEncoderModel() || 'aisingapore/Llama-SEA-LION-v3-8B-R';
const MANDARIN_ENCODER_MODEL_CANDIDATES = [
  DEFAULT_MANDARIN_ENCODER_MODEL,
  'aisingapore/sealion-v3.5-8b-r',
  'aisingapore/sealion-v3-8b-instruct',
  'google/gemini-2.0-flash-exp:free',
];

const SPARK_DOMAIN_LABELS: { en: string; zh: string }[] = [
  { en: 'Language & Literacy', zh: '语言与读写能力' },
  { en: 'Creative Expression', zh: '创意表达' },
  { en: 'Cultural Awareness', zh: '文化认知' },
  { en: 'Collaboration & Social Skills', zh: '协作与社交能力' },
  { en: 'Cognitive Development', zh: '认知发展' },
  { en: 'Fine Motor & Design Thinking', zh: '精细动作与设计思维' },
];

// ─── Default configs per provider ───────────────────────────────────────────

const DEFAULT_CONFIGS: Record<VLMProvider, Partial<VLMConfig>> = {
  colab: {
    baseUrl: getColabUrl() || 'https://8000-gpu-t4-s-ts859nfedjae-c.us-east1-0.prod.colab.dev',
    model: 'qwen2-vl',
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    mandarinEncoderModel: DEFAULT_MANDARIN_ENCODER_MODEL,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKey: getEnvApiKey(),
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    mandarinEncoderModel: DEFAULT_MANDARIN_ENCODER_MODEL,
  },
  huggingface: {
    baseUrl: 'https://api-inference.huggingface.co/models',
    model: 'Salesforce/blip-image-captioning-large',
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    mandarinEncoderModel: DEFAULT_MANDARIN_ENCODER_MODEL,
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llava',
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    mandarinEncoderModel: DEFAULT_MANDARIN_ENCODER_MODEL,
  },
  openrouter: {
    baseUrl: OPENROUTER_DEFAULT_BASE_URL,
    model: 'google/gemini-2.0-flash-exp:free',
    apiKey: getEnvOpenRouterApiKey(),
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    mandarinEncoderModel: DEFAULT_MANDARIN_ENCODER_MODEL,
  },
};

// ─── Config persistence ─────────────────────────────────────────────────────

export function getVLMConfig(): VLMConfig {
  const fallback: VLMConfig = {
    provider: 'colab',
    ...DEFAULT_CONFIGS.colab,
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    mandarinEncoderModel: DEFAULT_MANDARIN_ENCODER_MODEL,
  };

  const stored = localStorage.getItem('vlm_config');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<VLMConfig>;
      const provider = parsed.provider && parsed.provider in DEFAULT_CONFIGS
        ? parsed.provider as VLMProvider
        : fallback.provider;

      return {
        provider,
        ...DEFAULT_CONFIGS[provider],
        ...parsed,
        reportLanguage: parsed.reportLanguage === 'ZH' ? 'ZH' : DEFAULT_REPORT_LANGUAGE,
        mandarinEncoderModel: parsed.mandarinEncoderModel || DEFAULT_MANDARIN_ENCODER_MODEL,
      };
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

export function setVLMConfig(config: Partial<VLMConfig>): void {
  const current = getVLMConfig();
  const updated = { ...current, ...config };
  if (config.provider && config.provider !== current.provider) {
    Object.assign(updated, DEFAULT_CONFIGS[config.provider]);
  }

  updated.reportLanguage = updated.reportLanguage === 'ZH' ? 'ZH' : DEFAULT_REPORT_LANGUAGE;
  updated.mandarinEncoderModel = updated.mandarinEncoderModel || DEFAULT_MANDARIN_ENCODER_MODEL;

  localStorage.setItem('vlm_config', JSON.stringify(updated));
}

// ─── Shared utilities ───────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function base64ToBlob(base64OrDataUrl: string): Promise<Blob> {
  const base64 = base64OrDataUrl.includes(',')
    ? base64OrDataUrl.split(',')[1]
    : base64OrDataUrl;
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteArray], { type: 'image/jpeg' });
}

function toDataUrl(base64: string): string {
  return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
}

async function resolveImageBase64(imageSource: File | string): Promise<string> {
  return imageSource instanceof File ? fileToBase64(imageSource) : imageSource;
}

/** Simulate word-by-word streaming for providers that return full text at once. */
async function simulateStream(text: string, onChunk: (chunk: string) => void, delayMs = 20): Promise<void> {
  for (const word of text.split(' ')) {
    await new Promise(r => setTimeout(r, delayMs));
    onChunk(word + ' ');
  }
}

// ─── Shared SSE streaming parsers ───────────────────────────────────────────

/** Stream an OpenAI-compatible SSE response (used by OpenAI, OpenRouter). */
async function streamOpenAIResponse(response: Response, onChunk: (chunk: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const content = JSON.parse(data).choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch { /* skip malformed chunks */ }
    }
  }
}

/** Stream an Ollama NDJSON response. */
async function streamOllamaResponse(response: Response, onChunk: (chunk: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split('\n').filter(l => l.trim())) {
      try {
        const json = JSON.parse(line);
        if (json.response) onChunk(json.response);
      } catch { /* skip */ }
    }
  }
}

// ─── Shared OpenAI-compatible chat completions request ──────────────────────

async function queryChatCompletions(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: unknown[],
  onChunk: (chunk: string) => void,
  maxTokens = 1500,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: maxTokens }),
  });
  if (!response.ok) throw new Error(`API error: ${await response.text()}`);
  await streamOpenAIResponse(response, onChunk);
}

function buildVisionMessages(prompt: string, imageBase64?: string): unknown[] {
  const content: unknown[] = [];
  if (imageBase64) {
    content.push({ type: 'image_url', image_url: { url: toDataUrl(imageBase64) } });
  }
  content.push({ type: 'text', text: prompt });
  return [{ role: 'user', content }];
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function uniqueStringList(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function collectStreamOutput(
  runner: (onChunk: (chunk: string) => void) => Promise<void>,
): Promise<string> {
  let output = '';
  await runner((chunk) => {
    output += chunk;
  });
  return output.trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLikelyMandarin(text: string): boolean {
  const cjkCount = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return cjkCount >= 12;
}

function extractContextForConversion(report: string): string {
  const contextMatch = report.match(/(?:CONTEXT|情境)\s*[:：]\s*\n([\s\S]*?)(?=\n(?:OBSERVATION|观察记录)\s*[:：]|$)/i);
  return contextMatch?.[1]?.trim() || 'Classroom activity';
}

function convertLabelsOnlyToMandarin(report: string): string {
  let converted = report
    .replace(/\bCONTEXT\s*[:：]/gi, '情境：')
    .replace(/\bOBSERVATION\s*[:：]/gi, '观察记录：')
    .replace(/\bLEARNING\s+ANALYSIS\s*[:：]/gi, '学习分析：')
    .replace(/\bTeacher\s*[:：]/gi, '老师：');

  for (const { en, zh } of SPARK_DOMAIN_LABELS) {
    converted = converted.replace(new RegExp(`${escapeRegExp(en)}\\s*[:：]`, 'gi'), `${zh}:`);
  }

  return converted;
}

function buildMandarinTemplateExample(childName: string, context: string): string {
  const sparkTemplate = SPARK_DOMAIN_LABELS
    .map(({ zh }) => `${zh}: [基于图片证据写一句，明确说明${childName}的可观察行为。]`)
    .join('\n\n');

  return `---

情境:
${context}

观察记录:
[用第三人称温暖而专业地描述${childName}在图片中的真实行为。可分段，不使用要点符号。]

学习分析:

${sparkTemplate}

---`;
}

function buildMandarinConversionPrompt(
  sourceReport: string,
  childName: string,
  context: string,
  historicalSummary?: string,
): string {
  const sparkLabelGuide = SPARK_DOMAIN_LABELS.map(({ zh }) => `- ${zh}`).join('\n');
  const templatePrompt = buildMandarinTemplateExample(childName, context);
  const continuityGuidance = historicalSummary?.trim()
    ? `\nContinuity notes (hidden guidance only, never copy verbatim):\n${historicalSummary}\n`
    : '';

  return `You are a bilingual curriculum encoder.

Task: Convert the SOURCE REPORT into high-quality Mandarin Chinese for an E-Bridge SPARK observation report.
Read and follow the MANDARIN TEMPLATE PROMPT exactly as the output schema.

MANDARIN TEMPLATE PROMPT:
${templatePrompt}

${continuityGuidance}
SOURCE REPORT:
${sourceReport}

Output requirements:
- Return Mandarin Chinese only.
- Keep section headers exactly as: 情境:, 观察记录:, 学习分析:
- Use only these SPARK domain labels when evidence exists:
${sparkLabelGuide}
- Keep at least 2 SPARK domains.
- Do not fabricate details not present in the source report.
- Keep the child name as ${childName} exactly.
- Keep the tone warm, professional, and teacher-friendly.

Return only the final report.`;
}

export function buildSystemPrompt(
  childName: string,
  context: string,
  _historicalSummary?: string,
  language: ReportLanguage = DEFAULT_REPORT_LANGUAGE,
): string {
  if (language === 'ZH') {
    return `你是一位新加坡幼儿教育老师，正在撰写 "Moments" 观察报告。

你将看到一张课堂活动图片。请严格按照以下格式输出：

---

情境:
${context}

观察记录:
[使用第三人称，温暖且专业地详细描述${childName}在图片中的真实行为。
请包含可见的材料、动作、专注状态和互动细节。
若图中可见或可合理推断师生对话，可写成：
老师: "..."
${childName}: "..."
请使用连贯叙述，可分段，不用项目符号。]

学习分析:

语言与读写能力: [写一句说明该活动如何支持${childName}在语言与读写方面的发展，例如叙事组织、词汇表达、表达清晰度或书写相关能力。]

创意表达: [写一句说明${childName}在创意构思、审美选择、角色/场景设计或表达方式上的表现。]

文化认知: [写一句说明${childName}如何体现对文化元素、在地经验或过去与现在联系的理解。]

协作与社交能力: [写一句说明${childName}如何与同伴协作、倾听、回应或共同完成任务。]

认知发展: [写一句说明${childName}在思考、计划、推理、问题解决或任务结构化方面的表现。]

精细动作与设计思维: [写一句说明${childName}在精细动作、空间组织、构建、剪贴拼装或设计改进方面的表现。]

---

规则：
- 学习分析只保留在图片中有明确证据支持的SPARK学习领域
- 每份报告至少保留2个学习领域
- 每个学习领域句子都必须点名${childName}并包含可观察行为
- 不得猜测图片中看不见的事实
- 不得识别或点名其他孩子
- 观察记录必须是连贯叙述，不要使用项目符号
- 保持新加坡幼儿教育教师的专业且温暖语气`;
  }

  return `You are an early childhood educator writing a "Moments" observation report.

You will be given an image of a classroom activity. Generate a structured report following this EXACT format:

---

CONTEXT:
${context}

OBSERVATION:
[Write a warm, detailed narrative in third person describing exactly what ${childName} is doing in the image.
Include specific details about materials used, actions taken, focus level, and interactions visible.
If there is a teacher-child dialogue visible or implied, write it as:
Teacher: "..."
${childName}: "..."
Write as a continuous narrative, multiple paragraphs if needed. Be descriptive and professional but warm.]

LEARNING ANALYSIS:

Language & Literacy: [Write a sentence describing how this activity supported ${childName}'s language and literacy development — e.g. sequencing skills, descriptive vocabulary, story planning, writing, or verbal expression.]

Creative Expression: [Write a sentence about ${childName}'s originality, attention to detail in designing characters, settings, props, or artistic choices.]

Cultural Awareness: [Write a sentence about connections ${childName} made between past and present, appreciation of local heritage, or cultural elements explored.]

Collaboration & Social Skills: [Write a sentence about how ${childName} worked cooperatively, listened, contributed ideas, or interacted with peers.]

Cognitive Development: [Write a sentence about problem-solving, planning skills, structuring ideas, or critical thinking ${childName} demonstrated.]

Fine Motor & Design Thinking: [Write a sentence about precision, spatial awareness, construction skills, cutting, folding, assembling, or design work ${childName} performed.]

---

RULES:
- Only include Learning Analysis categories that are clearly evidenced in the image
- Minimum 2 categories per report
- Each category description must reference ${childName} by name with a specific observable action
- Never guess or assume what is not visible in the image
- Do not identify or label any other children visible in the image
- Write observation as a continuous narrative, not bullet points
- Match the tone of a Singapore early childhood educator`;
}

function buildRefinementPrompt(
  currentReport: string,
  followUpPrompt: string,
  childName: string,
  language: ReportLanguage = DEFAULT_REPORT_LANGUAGE,
): string {
  if (language === 'ZH') {
    return `你是一位幼儿教育老师，正在优化 "Moments" 观察报告。

以下是当前报告：

${currentReport}

教师提出了修改要求：
"${followUpPrompt}"

请输出完整重写后的报告，并保持完全一致的结构（情境、观察记录、学习分析）。仅修改教师明确要求的内容，其余信息保持一致。

输出格式必须严格如下（不要添加多余标题、说明、Markdown 代码块）：

情境:
[内容]

观察记录:
[内容]

学习分析:

语言与读写能力: [内容]
创意表达: [内容]
文化认知: [内容]
协作与社交能力: [内容]
认知发展: [内容]
精细动作与设计思维: [内容]

规则：
- 保持情境:, 观察记录:, 学习分析: 三个区块
- 全文持续使用${childName}姓名
- 未被要求修改的学习领域内容应尽量保留
- 不要输出任何解释性前缀（例如“以下是修订版”）
- 仅输出完整的修订后报告`;
  }

  return `You are an early childhood educator refining a "Moments" observation report.

Here is the CURRENT report that was previously generated:

${currentReport}

The teacher has requested the following change:
"${followUpPrompt}"

Please regenerate the FULL report in the EXACT same format (CONTEXT, OBSERVATION, LEARNING ANALYSIS sections) but with the requested changes applied. Keep all unmodified sections intact. Only change what the teacher requested.

Your output must follow this exact plain-text schema (no Markdown code fences, no extra preface):

CONTEXT:
[content]

OBSERVATION:
[content]

LEARNING ANALYSIS:

Language & Literacy: [content]
Creative Expression: [content]
Cultural Awareness: [content]
Collaboration & Social Skills: [content]
Cognitive Development: [content]
Fine Motor & Design Thinking: [content]

RULES:
- Maintain the same format with CONTEXT:, OBSERVATION:, and LEARNING ANALYSIS: sections
- Keep ${childName}'s name throughout
- Preserve any categories not mentioned in the change request
- Do not add any introductory or trailing commentary
- Output the complete revised report`;
}

function normalizeCategoryToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[：:]/g, '')
    .replace(/[&]/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapCategoryToLanguage(category: string, language: ReportLanguage): string {
  const normalizedCategory = normalizeCategoryToken(category);

  const aliasMap: Record<string, string[]> = {
    'Language & Literacy': ['Language and Literacy'],
    'Collaboration & Social Skills': ['Collaboration and Social Skills'],
    'Fine Motor & Design Thinking': ['Fine Motor and Design Thinking'],
  };

  for (const domain of SPARK_DOMAIN_LABELS) {
    const aliases = aliasMap[domain.en] || [];
    const candidates = [domain.en, domain.zh, ...aliases];
    const matched = candidates.some((candidate) => {
      const normalizedCandidate = normalizeCategoryToken(candidate);
      return normalizedCategory === normalizedCandidate || normalizedCategory.startsWith(normalizedCandidate);
    });

    if (matched) {
      return language === 'ZH' ? domain.zh : domain.en;
    }
  }

  return category.trim();
}

function normalizeLearningAnalysis(
  items: Array<{ category: string; description: string }>,
  language: ReportLanguage,
): Array<{ category: string; description: string }> {
  const orderedKnownLabels = SPARK_DOMAIN_LABELS.map((domain) =>
    language === 'ZH' ? domain.zh : domain.en,
  );

  const knownMap = new Map<string, string>();
  const unknownMap = new Map<string, string>();

  for (const item of items) {
    const description = item.description.trim();
    if (!description) continue;

    const mappedCategory = mapCategoryToLanguage(item.category, language);
    const isKnown = orderedKnownLabels.includes(mappedCategory);
    const targetMap = isKnown ? knownMap : unknownMap;
    const existing = targetMap.get(mappedCategory);
    targetMap.set(mappedCategory, existing ? `${existing} ${description}`.trim() : description);
  }

  const normalizedKnown = orderedKnownLabels
    .filter((category) => knownMap.has(category))
    .map((category) => ({ category, description: knownMap.get(category)! }));

  const normalizedUnknown = Array.from(unknownMap.entries()).map(([category, description]) => ({
    category,
    description,
  }));

  return [...normalizedKnown, ...normalizedUnknown];
}

function normalizeReportToTemplate(
  rawReport: string,
  language: ReportLanguage,
  options?: {
    fallbackReport?: string;
    fallbackContext?: string;
  },
): string {
  const trimmed = rawReport.trim();
  if (!trimmed) return trimmed;

  const parsed = parseReport(trimmed);
  const fallbackParsed = options?.fallbackReport ? parseReport(options.fallbackReport) : null;

  const context = parsed.context.trim()
    || fallbackParsed?.context.trim()
    || options?.fallbackContext?.trim()
    || '';

  const observation = parsed.observation.trim()
    || fallbackParsed?.observation.trim()
    || '';

  const sourceAnalysis = parsed.learningAnalysis.length > 0
    ? parsed.learningAnalysis
    : (fallbackParsed?.learningAnalysis || []);

  const learningAnalysis = normalizeLearningAnalysis(sourceAnalysis, language);

  if (!context && !observation && learningAnalysis.length === 0) {
    return trimmed;
  }

  const labels = REPORT_SECTION_LABELS[language];

  let output = `${labels.context}:\n${context}\n\n`;
  output += `${labels.observation}:\n${observation}\n\n`;
  output += `${labels.analysis}:\n\n`;

  for (const item of learningAnalysis) {
    output += `${item.category}: ${item.description}\n\n`;
  }

  return output.trim();
}

// ─── Provider query functions ───────────────────────────────────────────────

async function queryHuggingFace(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  const baseUrl = config.baseUrl || DEFAULT_CONFIGS.huggingface.baseUrl!;

  const imageBlob = await base64ToBlob(imageBase64);
  const captionResponse = await fetch(`${baseUrl}/${config.model}`, {
    method: 'POST',
    headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {},
    body: imageBlob,
  });
  if (!captionResponse.ok) throw new Error(`HuggingFace API error: ${await captionResponse.text()}`);

  const captionResult = await captionResponse.json();
  const caption = Array.isArray(captionResult)
    ? captionResult[0]?.generated_text
    : captionResult.generated_text || 'Unable to analyze image';

  const textModel = 'mistralai/Mistral-7B-Instruct-v0.3';
  const fullPrompt = `<s>[INST] ${prompt}\n\nImage description: ${caption}\n\nPlease provide a detailed observation report based on this information. [/INST]`;

  const textResponse = await fetch(`${baseUrl}/${textModel}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inputs: fullPrompt,
      parameters: { max_new_tokens: 1024, temperature: 0.7, return_full_text: false },
    }),
  });

  if (!textResponse.ok) {
    const fallback = `## Observation Report\n\n**Image Analysis:** ${caption}\n\n**User Query:** ${prompt}\n\n*Note: For more detailed analysis, please configure an API key in settings.*`;
    return simulateStream(fallback, onChunk, 30);
  }

  const textResult = await textResponse.json();
  const generatedText = Array.isArray(textResult)
    ? textResult[0]?.generated_text
    : textResult.generated_text || '';
  await simulateStream(generatedText, onChunk);
}

async function queryColab(
  imageSource: File | string,
  childName: string,
  context: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void,
  options?: { language?: ReportLanguage; systemPrompt?: string },
): Promise<void> {
  try {
    const healthResp = await fetch('/api/colab/health', {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (!healthResp.ok) {
      throw new Error(`Colab tunnel unreachable (health check ${healthResp.status}). Make sure the Colab server and ngrok are running.`);
    }
  } catch (err) {
    if (err instanceof TypeError) throw new Error('Cannot reach Colab proxy. Make sure the Vite dev server is running.');
    throw err;
  }

  const formData = new FormData();
  if (imageSource instanceof File) {
    formData.append('file', imageSource, imageSource.name);
  } else {
    formData.append('file', await base64ToBlob(imageSource), 'image.jpg');
  }
  formData.append('child_name', childName);
  formData.append('context', context);
  formData.append('language', options?.language || DEFAULT_REPORT_LANGUAGE);
  if (options?.systemPrompt) {
    formData.append('system_prompt', options.systemPrompt);
  }

  const response = await fetch('/api/colab/infer', { method: 'POST', body: formData });
  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
      throw new Error(`Colab tunnel returned an error page (${response.status}). The ngrok tunnel may have expired.`);
    }
    throw new Error(`Colab API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  await simulateStream(result.report || 'No response from model.', onChunk);
}

async function queryOpenAI(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const apiKey = config.apiKey || getEnvApiKey();
  if (!apiKey) throw new Error('OpenAI API key not found. Add VITE_OPENAI_API_KEY to your .env file.');
  const baseUrl = config.baseUrl || DEFAULT_CONFIGS.openai.baseUrl!;

  await queryChatCompletions(
    `${baseUrl}/chat/completions`,
    { 'Authorization': `Bearer ${apiKey}` },
    config.model!,
    [
      { role: 'system', content: prompt },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: toDataUrl(imageBase64) } },
        { type: 'text', text: 'Please analyze this image and generate the observation report.' },
      ]},
    ],
    onChunk,
  );
}

async function queryOllama(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const baseUrl = config.baseUrl || DEFAULT_CONFIGS.ollama.baseUrl!;
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      prompt,
      images: [imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')],
      stream: true,
    }),
  });
  if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}. Make sure Ollama is running with: ollama run llava`);
  await streamOllamaResponse(response, onChunk);
}

async function queryOpenRouter(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const apiKey = config.apiKey || getEnvOpenRouterApiKey();
  if (!apiKey) throw new Error('OpenRouter requires an API key. Add VITE_OPENROUTER_API_KEY or set key in settings.');
  const baseUrl = config.baseUrl || OPENROUTER_DEFAULT_BASE_URL;

  await queryChatCompletions(
    `${baseUrl}/chat/completions`,
    {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Kindergarten Observation Tool',
    },
    config.model!,
    buildVisionMessages(prompt, imageBase64),
    onChunk,
    1024,
  );
}

async function queryOpenRouterText(
  prompt: string,
  options: { apiKey: string; baseUrl: string; model: string },
  onChunk: (chunk: string) => void,
): Promise<void> {
  await queryChatCompletions(
    `${options.baseUrl}/chat/completions`,
    {
      'Authorization': `Bearer ${options.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Kindergarten Observation Tool',
    },
    options.model,
    [{ role: 'user', content: prompt }],
    onChunk,
    1700,
  );
}

async function queryCurrentProviderText(
  textPrompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void,
): Promise<void> {
  switch (config.provider) {
    case 'openai': {
      const apiKey = config.apiKey || getEnvApiKey();
      if (!apiKey) throw new Error('OpenAI API key not found.');
      const baseUrl = config.baseUrl || DEFAULT_CONFIGS.openai.baseUrl!;
      return queryChatCompletions(
        `${baseUrl}/chat/completions`,
        { 'Authorization': `Bearer ${apiKey}` },
        config.model!,
        [{ role: 'user', content: textPrompt }],
        onChunk,
      );
    }

    case 'openrouter': {
      const apiKey = config.apiKey || getEnvOpenRouterApiKey();
      if (!apiKey) throw new Error('OpenRouter API key not found.');
      return queryOpenRouterText(
        textPrompt,
        {
          apiKey,
          baseUrl: config.baseUrl || OPENROUTER_DEFAULT_BASE_URL,
          model: config.model || 'google/gemini-2.0-flash-exp:free',
        },
        onChunk,
      );
    }

    case 'ollama': {
      const baseUrl = config.baseUrl || DEFAULT_CONFIGS.ollama.baseUrl!;
      const ollamaResp = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, prompt: textPrompt, stream: true }),
      });
      if (!ollamaResp.ok) throw new Error(`Ollama API error: ${ollamaResp.statusText}`);
      return streamOllamaResponse(ollamaResp, onChunk);
    }

    default:
      throw new Error(`Provider ${config.provider} cannot run text-only Mandarin conversion fallback.`);
  }
}

interface ProviderRunParams {
  imageSource: File | string;
  imageBase64: string;
  childName: string;
  context: string;
  prompt: string;
  language: ReportLanguage;
  config: VLMConfig;
  onChunk: (chunk: string) => void;
}

async function runObservationByProvider(params: ProviderRunParams): Promise<void> {
  const {
    imageSource,
    imageBase64,
    childName,
    context,
    prompt,
    language,
    config,
    onChunk,
  } = params;

  switch (config.provider) {
    case 'colab':
      return queryColab(imageSource, childName, context, config, onChunk, {
        language,
        systemPrompt: prompt,
      });
    case 'openai':
      return queryOpenAI(imageBase64, prompt, config, onChunk);
    case 'huggingface':
      return queryHuggingFace(imageBase64, prompt, config, onChunk);
    case 'ollama':
      return queryOllama(imageBase64, prompt, config, onChunk);
    case 'openrouter':
      return queryOpenRouter(imageBase64, prompt, config, onChunk);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

interface RefinementRunParams {
  currentReport: string;
  followUpPrompt: string;
  childName: string;
  imageSource?: File | string | null;
  imageBase64?: string;
  refinementPrompt: string;
  language: ReportLanguage;
  config: VLMConfig;
  onChunk: (chunk: string) => void;
}

async function runRefinementByProvider(params: RefinementRunParams): Promise<void> {
  const {
    currentReport,
    followUpPrompt,
    childName,
    imageSource,
    imageBase64,
    refinementPrompt,
    language,
    config,
    onChunk,
  } = params;

  switch (config.provider) {
    case 'colab':
      if (imageSource) {
        return queryColab(
          imageSource,
          childName,
          `REFINEMENT REQUEST: ${followUpPrompt}\n\nPREVIOUS REPORT:\n${currentReport}`,
          config,
          onChunk,
          {
            language,
            systemPrompt: refinementPrompt,
          },
        );
      }
      return simulateStream(refinementPrompt, onChunk);

    case 'openai': {
      const apiKey = config.apiKey || getEnvApiKey();
      if (!apiKey) throw new Error('OpenAI API key not found.');
      const baseUrl = config.baseUrl || DEFAULT_CONFIGS.openai.baseUrl!;
      return queryChatCompletions(
        `${baseUrl}/chat/completions`,
        { 'Authorization': `Bearer ${apiKey}` },
        config.model!,
        buildVisionMessages(refinementPrompt, imageBase64 || undefined),
        onChunk,
      );
    }

    case 'huggingface':
      return queryHuggingFace(imageBase64 || '', refinementPrompt, config, onChunk);

    case 'ollama':
      if (imageBase64) return queryOllama(imageBase64, refinementPrompt, config, onChunk);
      return queryCurrentProviderText(refinementPrompt, config, onChunk);

    case 'openrouter': {
      const apiKey = config.apiKey || getEnvOpenRouterApiKey();
      if (!apiKey) throw new Error('OpenRouter requires an API key.');
      const baseUrl = config.baseUrl || OPENROUTER_DEFAULT_BASE_URL;
      const messages = imageBase64
        ? buildVisionMessages(refinementPrompt, imageBase64)
        : [{ role: 'user', content: refinementPrompt }];
      return queryChatCompletions(
        `${baseUrl}/chat/completions`,
        {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Kindergarten Observation Tool',
        },
        config.model!,
        messages,
        onChunk,
        1500,
      );
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

async function convertReportToMandarinViaSeaLion(
  sourceReport: string,
  childName: string,
  context: string,
  historicalSummary: string | undefined,
  config: VLMConfig,
): Promise<string> {
  const apiKey = config.provider === 'openrouter'
    ? (config.apiKey || getEnvOpenRouterApiKey())
    : getEnvOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key is required for SeaLion Mandarin conversion.');
  }

  const baseUrl = config.provider === 'openrouter'
    ? (config.baseUrl || OPENROUTER_DEFAULT_BASE_URL)
    : OPENROUTER_DEFAULT_BASE_URL;

  const conversionPrompt = buildMandarinConversionPrompt(sourceReport, childName, context, historicalSummary);
  const candidateModels = uniqueStringList([
    config.mandarinEncoderModel,
    ...MANDARIN_ENCODER_MODEL_CANDIDATES,
    config.provider === 'openrouter' ? config.model : undefined,
  ]);

  let lastError: Error | null = null;
  for (const model of candidateModels) {
    try {
      const translated = await collectStreamOutput((collector) =>
        queryOpenRouterText(
          conversionPrompt,
          { apiKey, baseUrl, model },
          collector,
        ),
      );
      if (translated.trim()) {
        return translated.trim();
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('SeaLion Mandarin conversion returned no output.');
}

async function convertReportToMandarin(
  sourceReport: string,
  childName: string,
  context: string,
  historicalSummary: string | undefined,
  config: VLMConfig,
): Promise<string> {
  const trimmed = sourceReport.trim();
  if (!trimmed) return trimmed;
  if (isLikelyMandarin(trimmed)) return trimmed;

  try {
    return await convertReportToMandarinViaSeaLion(trimmed, childName, context, historicalSummary, config);
  } catch (error) {
    console.warn('SeaLion Mandarin conversion failed. Falling back to current provider.', error);
  }

  try {
    const converted = await collectStreamOutput((collector) =>
      queryCurrentProviderText(
        buildMandarinConversionPrompt(trimmed, childName, context, historicalSummary),
        config,
        collector,
      ),
    );
    if (converted.trim()) return converted.trim();
  } catch (error) {
    console.warn('Provider Mandarin conversion failed. Falling back to label-only conversion.', error);
  }

  return convertLabelsOnlyToMandarin(trimmed);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AnalyzeImageOptions {
  historicalSummary?: string;
  language?: ReportLanguage;
}

export async function analyzeImage(
  imageSource: File | string,
  childName: string,
  context: string,
  onChunk: (chunk: string) => void,
  configOverride?: Partial<VLMConfig>,
  options?: AnalyzeImageOptions,
): Promise<void> {
  const config = { ...getVLMConfig(), ...configOverride };
  const reportLanguage = options?.language || config.reportLanguage || DEFAULT_REPORT_LANGUAGE;
  const imageBase64 = await resolveImageBase64(imageSource);

  const prompt = buildSystemPrompt(childName, context, options?.historicalSummary, reportLanguage);
  const generatedOutput = await collectStreamOutput((collector) =>
    runObservationByProvider({
      imageSource,
      imageBase64,
      childName,
      context,
      prompt,
      language: reportLanguage,
      config,
      onChunk: collector,
    }),
  );

  const normalizedOutput = normalizeReportToTemplate(generatedOutput, reportLanguage, {
    fallbackContext: context,
  });

  return simulateStream(normalizedOutput, onChunk, 12);
}

export async function refineReport(
  currentReport: string,
  followUpPrompt: string,
  childName: string,
  imageSource?: File | string | null,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const config = getVLMConfig();
  const reportLanguage = config.reportLanguage || DEFAULT_REPORT_LANGUAGE;
  const chunkCb = onChunk ?? (() => {});
  const basePromptLanguage: ReportLanguage = reportLanguage === 'ZH' ? 'EN' : reportLanguage;
  const refinementPrompt = buildRefinementPrompt(currentReport, followUpPrompt, childName, basePromptLanguage);

  let imageBase64 = '';
  if (imageSource) {
    imageBase64 = imageSource instanceof File ? await fileToBase64(imageSource) : imageSource;
  }

  if (reportLanguage === 'ZH') {
    const refinedEnglish = await collectStreamOutput((collector) =>
      runRefinementByProvider({
        currentReport,
        followUpPrompt,
        childName,
        imageSource,
        imageBase64,
        refinementPrompt,
        language: basePromptLanguage,
        config,
        onChunk: collector,
      }),
    );

    const normalizedEnglish = normalizeReportToTemplate(refinedEnglish, 'EN', {
      fallbackReport: currentReport,
      fallbackContext: extractContextForConversion(currentReport),
    });

    const contextForConversion = extractContextForConversion(normalizedEnglish)
      || extractContextForConversion(currentReport);

    const refinedMandarin = await convertReportToMandarin(
      normalizedEnglish,
      childName,
      contextForConversion,
      undefined,
      config,
    );

    const fallbackMandarin = convertLabelsOnlyToMandarin(currentReport);
    const normalizedMandarin = normalizeReportToTemplate(refinedMandarin, 'ZH', {
      fallbackReport: fallbackMandarin,
      fallbackContext: contextForConversion,
    });

    return simulateStream(normalizedMandarin, chunkCb, 12);
  }

  const refinedOutput = await collectStreamOutput((collector) =>
    runRefinementByProvider({
      currentReport,
      followUpPrompt,
      childName,
      imageSource,
      imageBase64,
      refinementPrompt,
      language: basePromptLanguage,
      config,
      onChunk: collector,
    }),
  );

  const normalizedOutput = normalizeReportToTemplate(refinedOutput, basePromptLanguage, {
    fallbackReport: currentReport,
    fallbackContext: extractContextForConversion(currentReport),
  });

  return simulateStream(normalizedOutput, chunkCb, 12);
}

// ─── Available models per provider ──────────────────────────────────────────

export const AVAILABLE_MODELS: Record<VLMProvider, { id: string; name: string; description: string }[]> = {
  colab: [
    { id: 'qwen2-vl', name: 'Qwen2-VL', description: 'Vision-language model on Colab GPU' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest multimodal model (recommended)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, more affordable' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation' },
  ],
  huggingface: [
    { id: 'Salesforce/blip-image-captioning-large', name: 'BLIP Large', description: 'Image captioning (free, no auth)' },
    { id: 'Salesforce/blip-image-captioning-base', name: 'BLIP Base', description: 'Faster, smaller model' },
    { id: 'nlpconnect/vit-gpt2-image-captioning', name: 'ViT-GPT2', description: 'Alternative captioning model' },
  ],
  ollama: [
    { id: 'llava', name: 'LLaVA', description: 'Best quality vision model' },
    { id: 'llava:13b', name: 'LLaVA 13B', description: 'Larger, more capable' },
    { id: 'bakllava', name: 'BakLLaVA', description: 'Alternative vision model' },
    { id: 'moondream', name: 'Moondream', description: 'Small, fast vision model' },
  ],
  openrouter: [
    { id: DEFAULT_MANDARIN_ENCODER_MODEL, name: 'SeaLion (Mandarin Encoder)', description: 'Preferred EN-to-ZH report conversion model' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', description: 'Fast, capable, free tier' },
    { id: 'google/gemini-pro-vision', name: 'Gemini Pro Vision', description: 'High quality analysis' },
    { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Fast and affordable' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Compact but capable' },
    { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 Vision (Free)', description: 'Open source, free' },
  ],
};
