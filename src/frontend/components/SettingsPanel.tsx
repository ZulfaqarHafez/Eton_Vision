import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ExternalLink, AlertCircle, Sparkles } from "lucide-react";
import {
  VLMProvider,
  VLMConfig,
  getVLMConfig,
  setVLMConfig,
  AVAILABLE_MODELS,
} from "@/backend/services/vlm";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [config, setLocalConfig] = useState<VLMConfig>(getVLMConfig());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(getVLMConfig());
    }
  }, [isOpen]);

  const handleSave = () => {
    setVLMConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleProviderChange = (provider: VLMProvider) => {
    const defaults: Record<VLMProvider, Partial<VLMConfig>> = {
      colab: {
        baseUrl: import.meta.env.VITE_COLAB_URL || 'https://8000-gpu-t4-s-ts859nfedjae-c.us-east1-0.prod.colab.dev',
        model: 'qwen2-vl',
      },
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
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

    setLocalConfig({
      ...config,
      provider,
      ...defaults[provider],
    });
  };

  const providerInfo: Record<VLMProvider, { name: string; description: string; setupUrl: string; requiresKey: boolean; usesEnvKey?: boolean }> = {
    colab: {
      name: 'Colab Tunnel (Qwen2-VL)',
      description: 'GPU-accelerated vision model running on Google Colab. No API key needed.',
      setupUrl: '#',
      requiresKey: false,
    },
    openai: {
      name: 'OpenAI GPT-4 Vision',
      description: 'Best quality. Uses GPT-4o with vision capabilities. API key loaded from .env file.',
      setupUrl: 'https://platform.openai.com/api-keys',
      requiresKey: true,
      usesEnvKey: true,
    },
    huggingface: {
      name: 'Hugging Face',
      description: 'Cloud-based, free tier available. Uses BLIP for image captioning + Mistral for text generation.',
      setupUrl: 'https://huggingface.co/settings/tokens',
      requiresKey: false,
    },
    ollama: {
      name: 'Ollama (Local)',
      description: 'Run models locally on your machine. Requires Ollama installed with LLaVA model.',
      setupUrl: 'https://ollama.ai/download',
      requiresKey: false,
    },
    openrouter: {
      name: 'OpenRouter',
      description: 'Access to many models including free tiers. Best quality with Gemini or Claude.',
      setupUrl: 'https://openrouter.ai/keys',
      requiresKey: true,
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/35 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-card/95 border-l border-border/80 z-50 overflow-y-auto"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/90 to-accent/80 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold font-display">AI Settings</h2>
                    <p className="text-xs text-muted-foreground font-medium">Choose your vision model</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-secondary/60 rounded-xl transition-colors border border-transparent hover:border-border/70"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Provider Selection */}
              <div className="space-y-4">
                <label className="text-sm font-bold font-display">AI Provider</label>
                <div className="grid gap-3">
                  {(Object.keys(providerInfo) as VLMProvider[]).map((provider) => (
                    <button
                      key={provider}
                      onClick={() => handleProviderChange(provider)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        config.provider === provider
                          ? 'border-primary/50 bg-primary/8'
                          : 'border-border/70 hover:border-primary/30 bg-background/70'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold font-display">{providerInfo[provider].name}</span>
                            {providerInfo[provider].requiresKey && (
                              <span className="text-[10px] px-2 py-0.5 bg-secondary text-muted-foreground rounded-full font-bold">
                                API Key Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {providerInfo[provider].description}
                          </p>
                        </div>
                        {config.provider === provider && (
                          <Check className="w-5 h-5 text-primary/80 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold font-display">
                    API Key {!providerInfo[config.provider].requiresKey && '(Optional)'}
                  </label>
                  <a
                    href={providerInfo[config.provider].setupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Get API Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {config.provider === 'colab' ? (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      No API key needed — using Colab tunnel
                    </p>
                  </div>
                ) : config.provider === 'openai' && import.meta.env.VITE_OPENAI_API_KEY ? (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      API key loaded from .env file
                    </p>
                  </div>
                ) : (
                  <input
                    type="password"
                    value={config.apiKey || ''}
                    onChange={(e) => setLocalConfig({ ...config, apiKey: e.target.value })}
                    placeholder="Enter your API key..."
                    className="w-full px-4 py-3 rounded-xl border border-border/70 bg-background/80 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/45"
                  />
                )}
                {config.provider === 'huggingface' && !config.apiKey && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Without API key, you may hit rate limits
                  </p>
                )}
              </div>

              {/* Model Selection */}
              <div className="mt-6 space-y-2">
                <label className="text-sm font-bold font-display">Model</label>
                <select
                  value={config.model}
                  onChange={(e) => setLocalConfig({ ...config, model: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border/70 bg-background/80 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/45"
                >
                  {AVAILABLE_MODELS[config.provider].map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Output language is selected directly in the Reports workspace.
                </p>
              </div>

              {/* Base URL (Advanced) */}
              <div className="mt-6 space-y-2">
                <label className="text-sm font-bold font-display text-muted-foreground">
                  Base URL (Advanced)
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ''}
                  onChange={(e) => setLocalConfig({ ...config, baseUrl: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border/70 bg-background/80 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/45 font-mono text-xs"
                />
              </div>

              {/* Ollama Instructions */}
              {config.provider === 'ollama' && (
                <div className="mt-6 p-4 rounded-2xl bg-background/70 border border-border/70">
                  <h3 className="text-sm font-bold font-display mb-2">Setup Instructions</h3>
                  <ol className="text-xs text-muted-foreground space-y-2">
                    <li>1. Install Ollama from <a href="https://ollama.ai" target="_blank" className="text-primary hover:underline">ollama.ai</a></li>
                    <li>2. Run: <code className="px-1.5 py-0.5 bg-background rounded">ollama pull llava</code></li>
                    <li>3. Start Ollama (it runs on port 11434 by default)</li>
                    <li>4. Make sure CORS is enabled for web access</li>
                  </ol>
                </div>
              )}

              {/* Save Button */}
              <div className="mt-8">
                <button
                  onClick={handleSave}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-white font-extrabold font-display hover:opacity-90 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                >
                  {saved ? (
                    <>
                      <Check className="w-5 h-5" />
                      Saved!
                    </>
                  ) : (
                    'Save Settings'
                  )}
                </button>
              </div>

              {/* Current Config Display */}
              <div className="mt-6 p-4 rounded-2xl bg-secondary/40 border border-border/70">
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-mono">{config.provider}</span> / <span className="font-mono">{config.model}</span>
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
