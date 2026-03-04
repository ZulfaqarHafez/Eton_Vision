/**
 * Vision Language Model Service
 * Supports multiple VLM backends:
 * 1. OpenAI GPT-4 Vision (recommended, uses env variable)
 * 2. Hugging Face Inference API (cloud, free tier available)
 * 3. Ollama (local, requires installation)
 * 4. OpenRouter (cloud, pay-per-use, access to many models)
 */

export type VLMProvider = 'colab' | 'huggingface' | 'ollama' | 'openrouter';
// export type VLMProvider = 'openai' | 'huggingface' | 'ollama' | 'openrouter';

export interface VLMConfig {
  provider: VLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// Get Colab tunnel URL from environment variable (Vite uses import.meta.env)
const getColabUrl = (): string | undefined => {
  return import.meta.env.VITE_COLAB_URL;
};

// // Get API key from environment variable (Vite uses import.meta.env)
// const getEnvApiKey = (): string | undefined => {
//   return import.meta.env.VITE_OPENAI_API_KEY;
// };

// Default configurations for each provider
const DEFAULT_CONFIGS: Record<VLMProvider, Partial<VLMConfig>> = {
  colab: {
    baseUrl: getColabUrl() || 'https://8000-gpu-t4-s-ts859nfedjae-c.us-east1-0.prod.colab.dev',
    model: 'qwen2-vl', // Model running on Colab GPU
  },
  // openai: {
  //   baseUrl: 'https://api.openai.com/v1',
  //   model: 'gpt-4o', // GPT-4 with vision
  // },
  huggingface: {
    baseUrl: 'https://api-inference.huggingface.co/models',
    model: 'Salesforce/blip-image-captioning-large', // Free, no auth required for basic usage
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llava', // LLaVA model for vision tasks
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-exp:free', // Free tier available
  },
};

// Get current config from localStorage or use defaults
export function getVLMConfig(): VLMConfig {
  const stored = localStorage.getItem('vlm_config');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return parsed;
    } catch {
      // Fall through to default
    }
  }
  // Default to Colab tunnel
  return {
    provider: 'colab',
    ...DEFAULT_CONFIGS.colab,
  };
}

export function setVLMConfig(config: Partial<VLMConfig>): void {
  const current = getVLMConfig();
  const updated = { ...current, ...config };
  // Apply provider defaults if provider changed
  if (config.provider && config.provider !== current.provider) {
    Object.assign(updated, DEFAULT_CONFIGS[config.provider]);
  }
  localStorage.setItem('vlm_config', JSON.stringify(updated));
}

// Convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Convert base64/data URL to blob for HuggingFace
async function base64ToBlob(base64OrDataUrl: string): Promise<Blob> {
  const base64 = base64OrDataUrl.includes(',') 
    ? base64OrDataUrl.split(',')[1] 
    : base64OrDataUrl;
  
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: 'image/jpeg' });
}

// Build kindergarten observation system prompt (Moments template)
function buildSystemPrompt(childName: string, context: string): string {
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
// Hugging Face Inference API
async function queryHuggingFace(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void
): Promise<void> {
  // For BLIP models, we need to use the image-to-text endpoint first
  // Then use a text model for detailed analysis
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // First, get image caption using BLIP
  const imageBlob = await base64ToBlob(imageBase64);
  
  const captionResponse = await fetch(
    `${config.baseUrl}/${config.model}`,
    {
      method: 'POST',
      headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {},
      body: imageBlob,
    }
  );

  if (!captionResponse.ok) {
    const error = await captionResponse.text();
    throw new Error(`HuggingFace API error: ${error}`);
  }

  const captionResult = await captionResponse.json();
  const caption = Array.isArray(captionResult) 
    ? captionResult[0]?.generated_text 
    : captionResult.generated_text || 'Unable to analyze image';

  // Now use a text model to generate detailed observation
  // Using Mistral for text generation (free tier)
  const textModel = 'mistralai/Mistral-7B-Instruct-v0.3';
  
  const fullPrompt = `<s>[INST] ${prompt}

Image description: ${caption}

Please provide a detailed observation report based on this information. [/INST]`;

  const textResponse = await fetch(
    `${config.baseUrl}/${textModel}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: {
          max_new_tokens: 1024,
          temperature: 0.7,
          return_full_text: false,
        },
      }),
    }
  );

  if (!textResponse.ok) {
    // If text model fails, return caption-based response
    const fallbackResponse = `## Observation Report\n\n**Image Analysis:** ${caption}\n\n**User Query:** ${prompt}\n\n*Note: For more detailed analysis, please configure an API key in settings.*`;
    
    // Simulate streaming for consistency
    const chunks = fallbackResponse.split(' ');
    for (const chunk of chunks) {
      await new Promise(r => setTimeout(r, 30));
      onChunk(chunk + ' ');
    }
    return;
  }

  const textResult = await textResponse.json();
  const generatedText = Array.isArray(textResult)
    ? textResult[0]?.generated_text
    : textResult.generated_text || '';

  // Simulate streaming for better UX
  const words = generatedText.split(' ');
  for (const word of words) {
    await new Promise(r => setTimeout(r, 20));
    onChunk(word + ' ');
  }
}

// Colab Tunnel API (custom Flask with /infer endpoint)
async function queryColab(
  imageSource: File | string,
  childName: string,
  context: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void
): Promise<void> {
  // First, verify the tunnel is reachable with a health check
  try {
    const healthResp = await fetch('/api/colab/health', {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (!healthResp.ok) {
      const healthText = await healthResp.text();
      console.error('[Colab] Health check failed:', healthResp.status, healthText.substring(0, 500));
      throw new Error(`Colab tunnel unreachable (health check ${healthResp.status}). Make sure the Colab server and ngrok are running.`);
    }
    console.log('[Colab] Health check passed');
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Cannot reach Colab proxy. Make sure the Vite dev server is running.');
    }
    throw err;
  }

  // Build multipart form data with the image file
  const formData = new FormData();
  if (imageSource instanceof File) {
    formData.append('file', imageSource, imageSource.name);
    console.log(`[Colab] Sending file: ${imageSource.name}, size: ${imageSource.size} bytes, type: ${imageSource.type}`);
  } else {
    // Fallback: convert base64/data URL to blob
    const blob = await base64ToBlob(imageSource);
    formData.append('file', blob, 'image.jpg');
    console.log(`[Colab] Sending blob, size: ${blob.size} bytes`);
  }
  formData.append('child_name', childName);
  formData.append('context', context);

  // Use Vite dev proxy to bypass CORS
  const response = await fetch('/api/colab/infer', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Colab] /infer failed: ${response.status} ${response.statusText}`);
    console.error(`[Colab] Response body (first 1000 chars):`, errorText.substring(0, 1000));

    // Check if error is HTML (ngrok error page) vs JSON (Flask error)
    if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
      throw new Error(`Colab tunnel returned an error page (${response.status}). The ngrok tunnel may have expired — check your Colab notebook.`);
    }
    throw new Error(`Colab API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  const report = result.report || 'No response from model.';
  console.log('[Colab] Success! Report length:', report.length);

  // Simulate streaming for better UX (Colab endpoint returns full response)
  const words = report.split(' ');
  for (const word of words) {
    await new Promise(r => setTimeout(r, 20));
    onChunk(word + ' ');
  }
}

// // OpenAI GPT-4 Vision API
// async function queryOpenAI(
//   imageBase64: string,
//   prompt: string,
//   config: VLMConfig,
//   onChunk: (chunk: string) => void
// ): Promise<void> {
//   const apiKey = config.apiKey || getEnvApiKey();
//
//   if (!apiKey) {
//     throw new Error('OpenAI API key not found.');
//   }
//
//   const systemPrompt = buildSystemPrompt();
//   const imageUrl = imageBase64.startsWith('data:')
//     ? imageBase64
//     : `data:image/jpeg;base64,${imageBase64}`;
//
//   const response = await fetch(`${config.baseUrl}/chat/completions`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${apiKey}`,
//     },
//     body: JSON.stringify({
//       model: config.model,
//       messages: [
//         { role: 'system', content: systemPrompt },
//         { role: 'user', content: [
//             { type: 'image_url', image_url: { url: imageUrl } },
//             { type: 'text', text: prompt },
//         ]},
//       ],
//       stream: true,
//       max_tokens: 1500,
//     }),
//   });
//
//   if (!response.ok) {
//     const error = await response.text();
//     throw new Error(`OpenAI API error: ${error}`);
//   }
//
//   const reader = response.body?.getReader();
//   if (!reader) throw new Error('No response body');
//   const decoder = new TextDecoder();
//   while (true) {
//     const { done, value } = await reader.read();
//     if (done) break;
//     const text = decoder.decode(value);
//     const lines = text.split('\n').filter(line => line.startsWith('data: '));
//     for (const line of lines) {
//       const data = line.slice(6);
//       if (data === '[DONE]') continue;
//       try {
//         const json = JSON.parse(data);
//         const content = json.choices?.[0]?.delta?.content;
//         if (content) onChunk(content);
//       } catch { /* skip */ }
//     }
//   }
// }

// Ollama local API (with LLaVA model)
async function queryOllama(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void
): Promise<void> {
  const response = await fetch(`${config.baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      prompt: prompt,
      images: [imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}. Make sure Ollama is running with: ollama run llava`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.response) {
          onChunk(json.response);
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
}

// OpenRouter API (supports many models including free ones)
async function queryOpenRouter(
  imageBase64: string,
  prompt: string,
  config: VLMConfig,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!config.apiKey) {
    throw new Error('OpenRouter requires an API key. Get one free at openrouter.ai');
  }

  // Ensure proper data URL format
  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Kindergarten Observation Tool',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      stream: true,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.startsWith('data: '));
    
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          onChunk(content);
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

// Main function to analyze image with VLM
export async function analyzeImage(
  imageSource: File | string, // File or base64/data URL
  childName: string,
  context: string,
  onChunk: (chunk: string) => void,
  configOverride?: Partial<VLMConfig>
): Promise<void> {
  const config = { ...getVLMConfig(), ...configOverride };

  // Build a text prompt from child name + context for non-Colab providers
  const prompt = buildSystemPrompt(childName, context);

  // Convert to base64 if File
  let imageBase64: string;
  if (imageSource instanceof File) {
    imageBase64 = await fileToBase64(imageSource);
  } else {
    imageBase64 = imageSource;
  }

  try {
    switch (config.provider) {
      case 'colab':
        // Colab Flask endpoint handles child_name and context separately
        await queryColab(imageSource, childName, context, config, onChunk);
        break;
      // case 'openai':
      //   await queryOpenAI(imageBase64, prompt, config, onChunk);
      //   break;
      case 'huggingface':
        await queryHuggingFace(imageBase64, prompt, config, onChunk);
        break;
      case 'ollama':
        await queryOllama(imageBase64, prompt, config, onChunk);
        break;
      case 'openrouter':
        await queryOpenRouter(imageBase64, prompt, config, onChunk);
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  } catch (error) {
    // Re-throw so the caller can handle error display
    throw error;
  }
}

// Available models for each provider
export const AVAILABLE_MODELS: Record<VLMProvider, { id: string; name: string; description: string }[]> = {
  colab: [
    { id: 'qwen2-vl', name: 'Qwen2-VL', description: 'Vision-language model on Colab GPU' },
  ],
  // openai: [
  //   { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest multimodal model (recommended)' },
  //   { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, more affordable' },
  //   { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation' },
  // ],
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
