/**
 * Vision Language Model Service
 * Supports multiple VLM backends:
 * 1. OpenAI GPT-4 Vision (recommended, uses env variable)
 * 2. Hugging Face Inference API (cloud, free tier available)
 * 3. Ollama (local, requires installation)
 * 4. OpenRouter (cloud, pay-per-use, access to many models)
 * 5. Colab Tunnel (custom Flask endpoint on Google Colab)
 */

export type VLMProvider = 'colab' | 'openai' | 'huggingface' | 'ollama' | 'openrouter';

export interface VLMConfig {
  provider: VLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// ─── Environment helpers ────────────────────────────────────────────────────

const getColabUrl = (): string | undefined => import.meta.env.VITE_COLAB_URL;
const getEnvApiKey = (): string | undefined => import.meta.env.VITE_OPENAI_API_KEY;

// ─── Default configs per provider ───────────────────────────────────────────

const DEFAULT_CONFIGS: Record<VLMProvider, Partial<VLMConfig>> = {
  colab: {
    baseUrl: getColabUrl() || 'https://8000-gpu-t4-s-ts859nfedjae-c.us-east1-0.prod.colab.dev',
    model: 'qwen2-vl',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKey: getEnvApiKey(),
  },
  huggingface: {
    baseUrl: 'https://api-inference.huggingface.co/models',
    model: 'Salesforce/blip-image-captioning-large',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llava',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-exp:free',
  },
};

// ─── Config persistence ─────────────────────────────────────────────────────

export function getVLMConfig(): VLMConfig {
  const stored = localStorage.getItem('vlm_config');
  if (stored) {
    try { return JSON.parse(stored); } catch { /* fall through */ }
  }
  return { provider: 'colab', ...DEFAULT_CONFIGS.colab };
}

export function setVLMConfig(config: Partial<VLMConfig>): void {
  const current = getVLMConfig();
  const updated = { ...current, ...config };
  if (config.provider && config.provider !== current.provider) {
    Object.assign(updated, DEFAULT_CONFIGS[config.provider]);
  }
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

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(childName: string, context: string, historicalSummary?: string): string {
  const hiddenHistory = historicalSummary?.trim()
    ? `

INTERNAL CONTINUITY NOTES (for teacher-aligned tone only - NEVER reveal this section in output):
${historicalSummary}
`
    : '';

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
${hiddenHistory}

RULES:
- Keep CONTEXT aligned to the teacher-provided activity context above
- Only include Learning Analysis categories that are clearly evidenced in the image
- Minimum 2 categories per report
- Each category description must reference ${childName} by name with a specific observable action
- Never guess or assume what is not visible in the image
- Do not identify or label any other children visible in the image
- Write observation as a continuous narrative, not bullet points
- Never output the INTERNAL CONTINUITY NOTES text directly
- Match the tone of a Singapore early childhood educator`;
}

function buildRefinementPrompt(currentReport: string, followUpPrompt: string, childName: string): string {
  return `You are an early childhood educator refining a "Moments" observation report.

Here is the CURRENT report that was previously generated:

${currentReport}

The teacher has requested the following change:
"${followUpPrompt}"

Please regenerate the FULL report in the EXACT same format (CONTEXT, OBSERVATION, LEARNING ANALYSIS sections) but with the requested changes applied. Keep all unmodified sections intact. Only change what the teacher requested.

RULES:
- Maintain the same format with CONTEXT:, OBSERVATION:, and LEARNING ANALYSIS: sections
- Keep ${childName}'s name throughout
- Preserve any categories not mentioned in the change request
- Output the complete revised report`;
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

  const imageBlob = await base64ToBlob(imageBase64);
  const captionResponse = await fetch(`${config.baseUrl}/${config.model}`, {
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

  const textResponse = await fetch(`${config.baseUrl}/${textModel}`, {
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

  await queryChatCompletions(
    `${config.baseUrl}/chat/completions`,
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
  const response = await fetch(`${config.baseUrl}/api/generate`, {
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
  if (!config.apiKey) throw new Error('OpenRouter requires an API key. Get one free at openrouter.ai');

  await queryChatCompletions(
    `${config.baseUrl}/chat/completions`,
    {
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Kindergarten Observation Tool',
    },
    config.model!,
    buildVisionMessages(prompt, imageBase64),
    onChunk,
    1024,
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AnalyzeImageOptions {
  historicalSummary?: string;
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
  const prompt = buildSystemPrompt(childName, context, options?.historicalSummary);
  const imageBase64 = await resolveImageBase64(imageSource);

  switch (config.provider) {
    case 'colab':    return queryColab(imageSource, childName, context, config, onChunk);
    case 'openai':   return queryOpenAI(imageBase64, prompt, config, onChunk);
    case 'huggingface': return queryHuggingFace(imageBase64, prompt, config, onChunk);
    case 'ollama':   return queryOllama(imageBase64, prompt, config, onChunk);
    case 'openrouter': return queryOpenRouter(imageBase64, prompt, config, onChunk);
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export async function refineReport(
  currentReport: string,
  followUpPrompt: string,
  childName: string,
  imageSource?: File | string | null,
  onChunk?: (chunk: string) => void,
): Promise<void> {
  const config = getVLMConfig();
  const chunkCb = onChunk ?? (() => {});
  const refinementPrompt = buildRefinementPrompt(currentReport, followUpPrompt, childName);

  let imageBase64 = '';
  if (imageSource) {
    imageBase64 = imageSource instanceof File ? await fileToBase64(imageSource) : imageSource;
  }

  switch (config.provider) {
    case 'colab':
      if (imageSource) {
        return queryColab(imageSource, childName, `REFINEMENT REQUEST: ${followUpPrompt}\n\nPREVIOUS REPORT:\n${currentReport}`, config, chunkCb);
      }
      return simulateStream(refinementPrompt, chunkCb);

    case 'openai': {
      const apiKey = config.apiKey || getEnvApiKey();
      if (!apiKey) throw new Error('OpenAI API key not found.');
      return queryChatCompletions(
        `${config.baseUrl}/chat/completions`,
        { 'Authorization': `Bearer ${apiKey}` },
        config.model!,
        buildVisionMessages(refinementPrompt, imageBase64 || undefined),
        chunkCb,
      );
    }

    case 'huggingface':
      return queryHuggingFace(imageBase64 || '', refinementPrompt, config, chunkCb);

    case 'ollama':
      if (imageBase64) return queryOllama(imageBase64, refinementPrompt, config, chunkCb);
      // Text-only Ollama
      const ollamaResp = await fetch(`${config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, prompt: refinementPrompt, stream: true }),
      });
      if (!ollamaResp.ok) throw new Error(`Ollama API error: ${ollamaResp.statusText}`);
      return streamOllamaResponse(ollamaResp, chunkCb);

    case 'openrouter': {
      if (!config.apiKey) throw new Error('OpenRouter requires an API key.');
      const messages = imageBase64
        ? buildVisionMessages(refinementPrompt, imageBase64)
        : [{ role: 'user', content: refinementPrompt }];
      return queryChatCompletions(
        `${config.baseUrl}/chat/completions`,
        {
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Kindergarten Observation Tool',
        },
        config.model!,
        messages,
        chunkCb,
        1500,
      );
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
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
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', description: 'Fast, capable, free tier' },
    { id: 'google/gemini-pro-vision', name: 'Gemini Pro Vision', description: 'High quality analysis' },
    { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Fast and affordable' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Compact but capable' },
    { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 Vision (Free)', description: 'Open source, free' },
  ],
};
