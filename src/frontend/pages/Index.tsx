import { useState, useCallback, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, PenLine, RefreshCw, Languages } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/frontend/components/Header";
import { ImageUpload, type UploadedPhoto } from "@/frontend/components/ImageUpload";
import { ReportPanel } from "@/frontend/components/ReportPanel";
import { SettingsPanel } from "@/frontend/components/SettingsPanel";
import { analyzeImage, getVLMConfig, refineReport, setVLMConfig, type ReportLanguage } from "@/backend/services/vlm";
import type { ParsedReport } from "../lib/parseReport";
import type { ScannedPhoto } from "@/frontend/components/PhotoReview";
import {
  fetchRecentReportsForStudent,
  type TaggedChild,
} from "@/frontend/lib/supabase";

const LazyFaceTagPanel = lazy(() =>
  import("@/frontend/components/FaceTagPanel").then((module) => ({ default: module.FaceTagPanel })),
);
const LazyPhotoReview = lazy(() =>
  import("@/frontend/components/PhotoReview").then((module) => ({ default: module.PhotoReview })),
);
const LazyStudentList = lazy(() =>
  import("@/frontend/components/StudentList").then((module) => ({ default: module.StudentList })),
);

function PanelLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 rounded-xl border border-border/70 bg-background/60 text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {label}
    </div>
  );
}

export type ReportStatus = 'idle' | 'loading' | 'error' | 'done';

function getProviderLabel(provider: string): string {
  if (provider === 'colab') return 'Qwen2-VL';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'huggingface') return 'Hugging Face';
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'openrouter') return 'OpenRouter';
  return provider;
}

const ACTIVITY_CONTEXT_DRAFT_KEY = "eton_activity_context_draft";

const CONTEXT_TEMPLATES = [
  {
    label: 'Habitat Build',
    text: 'Children are collaborating to build and label mini habitats using mixed classroom materials.',
  },
  {
    label: 'Story Role Play',
    text: 'Small-group storytelling through role play, props, and turn-taking prompts from the teacher.',
  },
  {
    label: 'Design Challenge',
    text: 'Hands-on design challenge where children test, improve, and explain their creations.',
  },
];

function isMeaningfulGeneratedOutput(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/^no response from model\.?$/i.test(normalized)) return false;
  return normalized.length >= 24;
}

function shiftPhotoIndexedRecord<T>(source: Record<number, T>, removedIndex: number): Record<number, T> {
  const next: Record<number, T> = {};
  for (const [key, value] of Object.entries(source)) {
    const numericKey = Number(key);
    if (numericKey === removedIndex) continue;
    const nextKey = numericKey > removedIndex ? numericKey - 1 : numericKey;
    next[nextKey] = value;
  }
  return next;
}

function languageToggleButtonClass(isActive: boolean): string {
  return `rounded-xl px-3 py-2 text-sm font-bold border transition-all disabled:opacity-50 ${
    isActive
      ? 'bg-primary text-white border-primary shadow-sm'
      : 'bg-background/85 border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/30'
  }`;
}

const Index = () => {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "students" ? "students" : "reports";

  // ── Shared report state ──────────────────────────────────
  const [context, setContext] = useState("");
  const [reportText, setReportText] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [reportLanguage, setReportLanguageState] = useState<ReportLanguage>('EN');
  const [currentProvider, setCurrentProvider] = useState(getVLMConfig().provider);
  const [includeHistoryContext, setIncludeHistoryContext] = useState(true);
  const [historyAssistNote, setHistoryAssistNote] = useState<string | null>(null);
  const [lastGenerationFingerprint, setLastGenerationFingerprint] = useState("");
  const generationRunRef = useRef(0);

  // ── Batch mode state (persists across tab switches) ──────
  const [batchPhotos, setBatchPhotos] = useState<UploadedPhoto[]>([]);
  const [scannedResults, setScannedResults] = useState<ScannedPhoto[]>([]);
  const [primaryPhotoIndex, setPrimaryPhotoIndex] = useState(0);
  const [excludedStudentIdsByPhoto, setExcludedStudentIdsByPhoto] = useState<Record<number, string[]>>({});
  const [manuallyAddedStudentsByPhoto, setManuallyAddedStudentsByPhoto] = useState<Record<number, TaggedChild[]>>({});

  // ── Legacy single-photo state (fallback) ─────────────────
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [taggedChildren, setTaggedChildren] = useState<TaggedChild[]>([]);

  const isBatchMode = batchPhotos.length > 0;

  useEffect(() => {
    const savedDraft = localStorage.getItem(ACTIVITY_CONTEXT_DRAFT_KEY);
    if (savedDraft) {
      setContext(savedDraft);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ACTIVITY_CONTEXT_DRAFT_KEY, context);
  }, [context]);

  const syncRuntimeConfig = useCallback(() => {
    const config = getVLMConfig();
    setReportLanguageState(config.reportLanguage === 'ZH' ? 'ZH' : 'EN');
    setCurrentProvider(config.provider);
  }, []);

  useEffect(() => {
    syncRuntimeConfig();
  }, [syncRuntimeConfig]);

  const handleReportLanguageChange = useCallback((language: ReportLanguage) => {
    const config = getVLMConfig();
    setCurrentProvider(config.provider);
    setReportLanguageState(language);
    setVLMConfig({ reportLanguage: language });
  }, []);

  const resetReportGenerationState = useCallback(() => {
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
    setHistoryAssistNote(null);
    setLastGenerationFingerprint('');
  }, []);

  const resetLegacySinglePhotoState = useCallback(() => {
    setSelectedImage(null);
    setImageFile(null);
    setTaggedChildren([]);
  }, []);

  const dedupeTags = useCallback((tags: TaggedChild[]) => {
    const tagMap = new Map<string, TaggedChild>();
    for (const child of tags) {
      const existing = tagMap.get(child.id);
      if (!existing || child.confidence > existing.confidence) {
        tagMap.set(child.id, child);
      }
    }
    return Array.from(tagMap.values());
  }, []);

  const photoTagsByIndex = useMemo(() => {
    const tagsByIndex: Record<number, TaggedChild[]> = {};
    for (let i = 0; i < batchPhotos.length; i++) {
      const scanTags = scannedResults[i]?.taggedChildren ?? [];
      const manualTags = manuallyAddedStudentsByPhoto[i] ?? [];
      tagsByIndex[i] = dedupeTags([...scanTags, ...manualTags]);
    }
    return tagsByIndex;
  }, [batchPhotos.length, dedupeTags, manuallyAddedStudentsByPhoto, scannedResults]);

  // ── Batch-wide totals across all photos ───────────────────
  const totalUniqueTags = useMemo(() => {
    return dedupeTags(Object.values(photoTagsByIndex).flat());
  }, [dedupeTags, photoTagsByIndex]);

  // ── Students for currently selected photo ────────────────
  const currentPhotoTags = useMemo(() => {
    return photoTagsByIndex[primaryPhotoIndex] ?? [];
  }, [photoTagsByIndex, primaryPhotoIndex]);

  const currentExcludedStudentIds = useMemo(
    () => new Set(excludedStudentIdsByPhoto[primaryPhotoIndex] ?? []),
    [excludedStudentIdsByPhoto, primaryPhotoIndex],
  );

  const activeStudentsForPrimaryPhoto = useMemo(
    () => currentPhotoTags.filter(t => !currentExcludedStudentIds.has(t.id)),
    [currentPhotoTags, currentExcludedStudentIds],
  );

  // ── Derived values for generate ──────────────────────────
  const activeFile = isBatchMode
    ? batchPhotos[primaryPhotoIndex]?.file ?? null
    : imageFile;
  const activePreview = isBatchMode
    ? batchPhotos[primaryPhotoIndex]?.preview ?? null
    : selectedImage;
  const activeChildren = isBatchMode ? activeStudentsForPrimaryPhoto : taggedChildren;
  const childNames = activeChildren.map(c => c.name).join(', ');
  const activityContext = context.trim() || "Classroom activity";

  const activeStudentIdsKey = useMemo(
    () => activeChildren.map((child) => child.id).sort().join('|'),
    [activeChildren],
  );

  const activeFileKey = useMemo(() => {
    if (!activeFile) return '';
    return `${activeFile.name}:${activeFile.size}:${activeFile.lastModified}`;
  }, [activeFile]);

  const currentGenerationFingerprint = useMemo(
    () => `${activityContext}__${activeStudentIdsKey}__${activeFileKey}__${reportLanguage}`,
    [activityContext, activeStudentIdsKey, activeFileKey, reportLanguage],
  );

  const hasGenerationInputChanged = reportStatus === 'done'
    && lastGenerationFingerprint.length > 0
    && lastGenerationFingerprint !== currentGenerationFingerprint;

  const buildHistoricalSummary = useCallback(async (): Promise<string | null> => {
    if (!includeHistoryContext || activeChildren.length === 0) return null;

    const primaryChild = activeChildren[0];
    const recentReports = await fetchRecentReportsForStudent(
      primaryChild.name,
      primaryChild.class_group,
      3,
    );

    if (recentReports.length === 0) return null;

    const summaryLines = recentReports.map((item, index) => {
      const reportDate = new Date(item.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      });
      const sourceText = (item.observation || item.context || '').replace(/\s+/g, ' ').trim();
      const snippet = sourceText.length > 140 ? `${sourceText.slice(0, 140)}...` : sourceText;
      return `${index + 1}. ${reportDate}: ${snippet || 'No previous text snippet available.'}`;
    });

    return `Recent observations for ${primaryChild.name}:\n${summaryLines.join('\n')}`;
  }, [activeChildren, includeHistoryContext]);

  // ── Handlers ─────────────────────────────────────────────

  // Legacy single-photo select (not used when multiple=true, kept for safety)
  const handleImageSelect = useCallback((file: File, preview: string) => {
    setSelectedImage(preview);
    setImageFile(file);
    setTaggedChildren([]);
    resetReportGenerationState();
  }, [resetReportGenerationState]);

  const handleClearAll = useCallback(() => {
    // Clear batch
    setBatchPhotos([]);
    setScannedResults([]);
    setPrimaryPhotoIndex(0);
    setExcludedStudentIdsByPhoto({});
    setManuallyAddedStudentsByPhoto({});
    resetLegacySinglePhotoState();
    resetReportGenerationState();
    setRefinePrompt('');
  }, [resetLegacySinglePhotoState, resetReportGenerationState]);

  const handleBatchSelect = useCallback((photos: UploadedPhoto[]) => {
    setBatchPhotos(photos);
    setScannedResults([]);
    setPrimaryPhotoIndex(0);
    setExcludedStudentIdsByPhoto({});
    setManuallyAddedStudentsByPhoto({});
    resetLegacySinglePhotoState();
    resetReportGenerationState();
  }, [resetLegacySinglePhotoState, resetReportGenerationState]);

  const handleAddMorePhotos = useCallback((newPhotos: UploadedPhoto[]) => {
    setBatchPhotos(prev => [...prev, ...newPhotos]);
  }, []);

  const handleRemovePhoto = useCallback((index: number) => {
    setBatchPhotos(prev => prev.filter((_, i) => i !== index));
    setScannedResults(prev => prev.filter((_, i) => i !== index));
    setExcludedStudentIdsByPhoto(prev => shiftPhotoIndexedRecord(prev, index));
    setManuallyAddedStudentsByPhoto(prev => shiftPhotoIndexedRecord(prev, index));
    setPrimaryPhotoIndex(prev => {
      if (prev > index) return prev - 1;
      if (prev === index) return 0;
      return prev;
    });
  }, []);

  const handleScanComplete = useCallback((results: ScannedPhoto[]) => {
    setScannedResults(results);
  }, []);

  const handleToggleStudent = useCallback((childId: string) => {
    setExcludedStudentIdsByPhoto(prev => {
      const current = new Set(prev[primaryPhotoIndex] ?? []);
      if (current.has(childId)) current.delete(childId);
      else current.add(childId);

      const next = { ...prev };
      const updated = Array.from(current);
      if (updated.length === 0) {
        delete next[primaryPhotoIndex];
      } else {
        next[primaryPhotoIndex] = updated;
      }
      return next;
    });
  }, [primaryPhotoIndex]);

  const handleManualAddStudent = useCallback((child: TaggedChild) => {
    setManuallyAddedStudentsByPhoto(prev => {
      const existing = prev[primaryPhotoIndex] ?? [];
      if (existing.some(c => c.id === child.id)) return prev;

      return {
        ...prev,
        [primaryPhotoIndex]: [...existing, child],
      };
    });

    // Make sure it's not excluded
    setExcludedStudentIdsByPhoto(prev => {
      const current = new Set(prev[primaryPhotoIndex] ?? []);
      current.delete(child.id);

      const next = { ...prev };
      const updated = Array.from(current);
      if (updated.length === 0) {
        delete next[primaryPhotoIndex];
      } else {
        next[primaryPhotoIndex] = updated;
      }
      return next;
    });
  }, [primaryPhotoIndex]);

  const handleSettingsClose = useCallback(() => {
    setIsSettingsOpen(false);
    syncRuntimeConfig();
  }, [syncRuntimeConfig]);

  const handleGenerate = useCallback(async () => {
    if (!activeFile) {
      setReportError('Upload a photo before generating a report.');
      setReportStatus('error');
      return;
    }

    if (activeChildren.length === 0) {
      setReportError('Select at least one student in the Main Focus photo before generating.');
      setReportStatus('error');
      return;
    }

    const runId = generationRunRef.current + 1;
    generationRunRef.current = runId;

    setReportText('');
    setReportError(null);
    setReportStatus('loading');
    setHistoryAssistNote(null);

    try {
      const config = getVLMConfig();
      const runConfig = {
        ...config,
        reportLanguage,
      };
      setCurrentProvider(runConfig.provider);
      setVLMConfig({ reportLanguage });
      let historicalSummary: string | undefined;

      if (includeHistoryContext) {
        if (runConfig.provider === 'colab') {
          setHistoryAssistNote('History assist is unavailable in Colab mode. Using Activity Context only.');
        } else {
          const summary = await buildHistoricalSummary();
          if (summary) {
            historicalSummary = summary;
            setHistoryAssistNote('Continuity notes from recent reports were applied.');
          } else {
            setHistoryAssistNote('No recent reports found for continuity notes. Using Activity Context only.');
          }
        }
      } else {
        setHistoryAssistNote('History assist is off. Using Activity Context only.');
      }

      const runAttempt = async (summaryOverride?: string): Promise<string> => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let streamedText = '';

        try {
          const generationPromise = analyzeImage(
            activeFile,
            childNames,
            activityContext,
            (chunk) => {
              if (generationRunRef.current !== runId) return;
              streamedText += chunk;
              setReportText((prev) => prev + chunk);
            },
            runConfig,
            { historicalSummary: summaryOverride, language: reportLanguage },
          );

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('Generation timed out after 90 seconds. Please retry.'));
            }, 90000);
          });

          await Promise.race([generationPromise, timeoutPromise]);
          return streamedText;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      const firstOutput = await runAttempt(historicalSummary);

      if (generationRunRef.current !== runId) return;

      if (!isMeaningfulGeneratedOutput(firstOutput)) {
        setReportText('');
        setHistoryAssistNote(
          historicalSummary
            ? 'First response was empty. Retrying automatically without history context.'
            : 'First response was empty. Retrying automatically...',
        );

        const retryOutput = await runAttempt(undefined);

        if (generationRunRef.current !== runId) return;

        if (!isMeaningfulGeneratedOutput(retryOutput)) {
          throw new Error('Model returned an empty response. Please retry.');
        }
      }

      if (generationRunRef.current !== runId) return;

      setReportStatus('done');
      setLastGenerationFingerprint(currentGenerationFingerprint);
    } catch (error) {
      if (generationRunRef.current !== runId) return;
      generationRunRef.current = runId + 1;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setReportError(errorMsg);
      setReportStatus('error');
    }
  }, [
    activeChildren.length,
    activeFile,
    activityContext,
    buildHistoricalSummary,
    childNames,
    currentGenerationFingerprint,
    includeHistoryContext,
    reportLanguage,
  ]);

  const isLoading = reportStatus === 'loading';
  const outputLanguageLabel = reportLanguage === 'ZH' ? 'Mandarin Chinese' : 'English';
  const generateButtonLabel = reportLanguage === 'ZH' ? 'Generate Mandarin Report' : 'Generate Report';
  const languageHelpText = reportLanguage === 'ZH'
    ? 'Mandarin mode converts the report into the SPARK Mandarin template automatically.'
    : 'English mode generates the report directly in English.';
  const canRefine = refinePrompt.trim().length > 0 && !isRefining && !hasGenerationInputChanged;
  const isGenerateDisabled = !activeFile || activeChildren.length === 0 || isLoading || isRefining;

  const handleFollowUp = useCallback(async () => {
    if (!reportText || isRefining || !refinePrompt.trim()) return;

    if (hasGenerationInputChanged) {
      setReportError('Activity context, selected students, or output language changed. Generate again before refining.');
      return;
    }

    const currentReport = reportText;
    setIsRefining(true);
    setReportError(null);
    setReportText('');
    setReportStatus('loading');

    try {
      const config = getVLMConfig();
      setCurrentProvider(config.provider);
      setVLMConfig({ reportLanguage });
      await refineReport(
        currentReport,
        refinePrompt,
        childNames,
        activeFile,
        (chunk) => {
          setReportText((prev) => prev + chunk);
        }
      );
      setReportStatus('done');
      setRefinePrompt('');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setReportError(errorMsg);
      setReportStatus('error');
    } finally {
      setIsRefining(false);
    }
  }, [reportText, isRefining, refinePrompt, childNames, activeFile, hasGenerationInputChanged, reportLanguage]);

  const handleReportEdit = useCallback((updated: ParsedReport) => {
    setReportText(updated.raw);
  }, []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Warm decorative background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -right-36 w-[460px] h-[460px] rounded-full bg-primary/4 blur-3xl" />
        <div className="absolute top-1/3 -left-44 w-[360px] h-[360px] rounded-full bg-accent/4 blur-3xl" />
      </div>

      <Header onSettingsOpen={() => setIsSettingsOpen(true)} />
      <SettingsPanel isOpen={isSettingsOpen} onClose={handleSettingsClose} />

      <main className="relative z-10 min-h-[calc(100vh-4rem)] pt-16 pb-16 md:pb-6">
        {/* Reports View */}
        {activeTab === "reports" && (
          <div className="max-w-7xl mx-auto p-5 md:p-6 flex flex-col gap-6">
            {/* Top Section — Upload + Inputs in 2 columns */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
            {/* Left Column — Upload / Bounding Boxes */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-border/50 bg-card/45 p-5 md:p-6 flex flex-col gap-5"
            >
              {/* ── Upload or PhotoReview ──────────────────── */}
              {isBatchMode ? (
                <Suspense fallback={<PanelLoadingFallback label="Loading photo review tools..." />}>
                  <LazyPhotoReview
                    photos={batchPhotos}
                    savedScans={scannedResults}
                    onScanComplete={handleScanComplete}
                    primaryIndex={primaryPhotoIndex}
                    onSetPrimary={setPrimaryPhotoIndex}
                    onAddMore={handleAddMorePhotos}
                    onRemovePhoto={handleRemovePhoto}
                    currentPhotoTags={currentPhotoTags}
                    photoTagsByIndex={photoTagsByIndex}
                    excludedStudentIds={currentExcludedStudentIds}
                    onToggleStudent={handleToggleStudent}
                    onManualAdd={handleManualAddStudent}
                    totalUniqueFound={totalUniqueTags.length}
                    onClearAll={handleClearAll}
                  />
                </Suspense>
              ) : (
                <>
                  {/* Single-photo upload */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary/60" />
                        Classroom Photo
                      </label>
                      {selectedImage && (
                        <button
                          onClick={handleClearAll}
                          className="text-xs text-primary hover:underline font-bold py-1 px-2 rounded-lg hover:bg-primary/5 transition-colors"
                        >
                          Change photo
                        </button>
                      )}
                    </div>
                    {!selectedImage && (
                      <ImageUpload
                        onImageSelect={handleImageSelect}
                        onBatchSelect={handleBatchSelect}
                        selectedImage={selectedImage}
                        onClear={handleClearAll}
                        multiple
                      />
                    )}
                  </div>

                  {selectedImage && (
                    <Suspense fallback={<PanelLoadingFallback label="Loading face tagging tools..." />}>
                      <LazyFaceTagPanel
                        imageFile={imageFile}
                        imagePreview={selectedImage}
                        onTagsChange={setTaggedChildren}
                      />
                    </Suspense>
                  )}
                </>
              )}
            </motion.div>

            {/* Right Column — Context + Language + Generate */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="rounded-2xl border border-border/50 bg-card/45 p-5 md:p-6 flex flex-col gap-5"
            >
              {/* Activity Context */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-accent/60" />
                  Activity Context
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Describe what's happening... e.g. Children have been working with clay to create sea turtles over the past week."
                  disabled={isLoading || isRefining}
                  rows={7}
                  className="chat-input w-full resize-none text-sm"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>{context.trim().length} characters</span>
                  <span>Draft auto-saved</span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {CONTEXT_TEMPLATES.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      onClick={() => setContext(template.text)}
                      disabled={isLoading || isRefining}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                  <input
                    type="checkbox"
                    checked={includeHistoryContext}
                    onChange={(e) => setIncludeHistoryContext(e.target.checked)}
                    disabled={isLoading || isRefining}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Use recent reports to keep continuity for the same student
                </label>
              </div>

              {/* Report language (front workflow, not settings) */}
              <div className="rounded-2xl border border-border/70 bg-card/82 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-primary/70" />
                    Output Language
                  </label>
                  <span className="text-[10px] font-bold text-primary/70 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    {getProviderLabel(currentProvider)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleReportLanguageChange('EN')}
                    disabled={isLoading || isRefining}
                    className={languageToggleButtonClass(reportLanguage === 'EN')}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReportLanguageChange('ZH')}
                    disabled={isLoading || isRefining}
                    className={languageToggleButtonClass(reportLanguage === 'ZH')}
                  >
                    Mandarin
                  </button>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {languageHelpText}
                </p>
              </div>

              {/* Refine — after report */}
              {reportStatus === 'done' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-1.5"
                >
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[hsl(270,55%,70%)]/60" />
                    Refine Report
                  </label>
                  <textarea
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    placeholder="e.g. Add more details about collaboration, focus on creative expression..."
                    disabled={isRefining}
                    rows={2}
                    className="chat-input w-full resize-none text-sm"
                  />
                  {reportError && (
                    <p className="text-xs text-destructive mt-1 px-1 font-medium">{reportError}</p>
                  )}
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="mt-auto pt-1">
                <div className="rounded-2xl border border-border/70 bg-card/88 p-3.5 space-y-2">
                  {hasGenerationInputChanged && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2">
                      Activity context, selected students, or output language changed. Generate again to apply updates.
                    </p>
                  )}

                  {historyAssistNote && !isLoading && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      {historyAssistNote}
                    </p>
                  )}

                  {!isLoading && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      Output: {outputLanguageLabel}
                    </p>
                  )}

                  {reportStatus === 'done' && (
                    <button
                      onClick={handleFollowUp}
                      disabled={!canRefine}
                      className="btn-primary w-full flex items-center justify-center gap-2.5 py-3.5 text-[15px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isRefining ? (
                        <>
                          <Loader2 className="w-4.5 h-4.5 animate-spin" />
                          Refining...
                        </>
                      ) : (
                        <>
                          <PenLine className="w-4 h-4" />
                          Refine Report
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={isGenerateDisabled}
                    className={`w-full flex items-center justify-center gap-2.5 py-3.5 text-[15px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ${
                      reportStatus === 'done'
                        ? 'btn-secondary'
                        : 'btn-primary'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4.5 h-4.5 animate-spin" />
                        Generating...
                      </>
                    ) : reportStatus === 'done' ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        {hasGenerationInputChanged ? 'Apply Updates' : 'Re-generate'}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {generateButtonLabel}
                      </>
                    )}
                  </button>

                  {(!activeFile || activeChildren.length === 0) && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      {!activeFile
                        ? 'Upload a photo to enable generation.'
                        : 'Select at least one student in Main Focus photo to enable generation.'}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
            </div>

            {/* Bottom — Observation Report */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex flex-col min-h-[520px]"
            >
              <ReportPanel
                reportText={reportText}
                status={reportStatus}
                error={reportError}
                onRetry={handleGenerate}
                childName={childNames}
                isStreaming={reportStatus === 'loading' && reportText.length > 0}
                taggedChildren={activeChildren}
                imagePreview={activePreview}
                imageFile={activeFile}
                onReportEdit={handleReportEdit}
              />
            </motion.div>
          </div>
        )}

        {/* Students View */}
        {activeTab === "students" && (
          <div>
            <div className="max-w-2xl mx-auto p-4 md:p-6">
              <Suspense fallback={<PanelLoadingFallback label="Loading student workspace..." />}>
                <LazyStudentList />
              </Suspense>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
