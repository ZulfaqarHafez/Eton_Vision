import { useState, useCallback, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, PenLine, RefreshCw, Languages, ChevronDown, ChevronUp, FlaskConical, BookOpen, UserPen } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/frontend/components/Header";
import { ImageUpload, type UploadedPhoto } from "@/frontend/components/ImageUpload";
import { ReportPanel } from "@/frontend/components/ReportPanel";
import { SettingsPanel } from "@/frontend/components/SettingsPanel";
import { analyzeImage, mockAnalyzeImage, getVLMConfig, refineReport, setVLMConfig, type ReportLanguage } from "@/backend/services/vlm";
import type { ParsedReport } from "../lib/parseReport";
import type { ScannedPhoto } from "@/frontend/components/PhotoReview";
import {
  fetchRecentReportsForStudent,
  type TaggedChild,
} from "@/frontend/lib/supabase";
import {
  type Grade,
  GRADE_LABELS,
  type CategoryId,
  ETON_CATEGORIES,
  LEARNING_GOALS,
  getGoalsForGradeAndCategory,
} from "@/frontend/lib/learningGoals";

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

function gradeButtonClass(isActive: boolean): string {
  return `px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
    isActive
      ? 'bg-primary text-white border-primary'
      : 'bg-background/80 border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/30'
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

  // ── Grade & Learning Goals tagging ──────────────────────
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [expandedGoalsPanel, setExpandedGoalsPanel] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<CategoryId>>(new Set());
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [lessonPlanContext, setLessonPlanContext] = useState('');
  const [showLessonPlan, setShowLessonPlan] = useState(false);
  const [studentNotes, setStudentNotes] = useState<Record<string, string>>({});
  const [showStudentNotes, setShowStudentNotes] = useState(false);
  const [activeStudentNoteId, setActiveStudentNoteId] = useState<string | null>(null);
  const [generateHintAttempted, setGenerateHintAttempted] = useState(false);

  // ── Test mode ────────────────────────────────────────────
  const [testMode, setTestMode] = useState(false);
  const [showVariableInspector, setShowVariableInspector] = useState(false);

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
    const allReports = await fetchRecentReportsForStudent(
      primaryChild.name,
      primaryChild.class_group,
      20,
    );

    if (allReports.length === 0) return null;

    // Take 2 most recent + sample 2 from older reports to avoid repetitive phrasing
    const recent = allReports.slice(0, 2);
    const older = allReports.slice(2);
    const sampledOlder = older
      .map((r) => ({ r, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, 2)
      .map(({ r }) => r);

    const selected = [...recent, ...sampledOlder].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const summaryLines = selected.map((item, index) => {
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
    setStudentNotes({});
    setShowStudentNotes(false);
    setActiveStudentNoteId(null);
  }, [resetLegacySinglePhotoState, resetReportGenerationState]);

  const handleBatchSelect = useCallback((photos: UploadedPhoto[]) => {
    setBatchPhotos(photos);
    setScannedResults([]);
    setPrimaryPhotoIndex(0);
    setExcludedStudentIdsByPhoto({});
    setManuallyAddedStudentsByPhoto({});
    resetLegacySinglePhotoState();
    resetReportGenerationState();
    setStudentNotes({});
    setShowStudentNotes(false);
    setActiveStudentNoteId(null);
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

      const subGoalById = new Map(
        LEARNING_GOALS.flatMap((g) =>
          g.subGoals.map((sg) => [sg.id, `${sg.code} ${sg.label}`])
        )
      );
      const selectedGoalLabels = selectedGoalIds
        .map((id) => subGoalById.get(id))
        .filter((l): l is string => l !== undefined);

      const relevantStudentNotes: Record<string, string> = {};
      for (const child of activeChildren) {
        const note = studentNotes[child.id]?.trim();
        if (note) relevantStudentNotes[child.name] = note;
      }

      const generateFn = testMode ? mockAnalyzeImage : analyzeImage;

      const runAttempt = async (summaryOverride?: string): Promise<string> => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let streamedText = '';

        try {
          const generationPromise = generateFn(
            activeFile,
            childNames,
            activityContext,
            (chunk) => {
              if (generationRunRef.current !== runId) return;
              streamedText += chunk;
              setReportText((prev) => prev + chunk);
            },
            runConfig,
            {
              historicalSummary: summaryOverride,
              language: reportLanguage,
              grade: selectedGrade ? GRADE_LABELS[selectedGrade] : undefined,
              selectedGoals: selectedGoalLabels.length > 0 ? selectedGoalLabels : undefined,
              lessonPlan: lessonPlanContext.trim() || undefined,
              studentNotes: Object.keys(relevantStudentNotes).length > 0 ? relevantStudentNotes : undefined,
            },
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
    lessonPlanContext,
    reportLanguage,
    selectedGoalIds,
    selectedGrade,
    studentNotes,
    testMode,
  ]);

  const isLoading = reportStatus === 'loading';
  const outputLanguageLabel = reportLanguage === 'ZH' ? 'Mandarin Chinese' : 'English';
  const generateButtonLabel = testMode
    ? 'Test Generate'
    : reportLanguage === 'ZH' ? 'Generate Mandarin Report' : 'Generate Report';
  const languageHelpText = reportLanguage === 'ZH'
    ? 'Mandarin mode converts the report into the SPARK Mandarin template automatically.'
    : 'English mode generates the report directly in English.';
  const canRefine = refinePrompt.trim().length > 0 && !isRefining && !hasGenerationInputChanged;
  const isGenerateHardDisabled = isLoading || isRefining;
  const isGenerateSoftDisabled = !activeFile || activeChildren.length === 0;
  const isGenerateDisabled = isGenerateHardDisabled || isGenerateSoftDisabled;

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

              {/* ── Lesson Plan Context ── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowLessonPlan((p) => !p)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading || isRefining}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {showLessonPlan ? 'Hide lesson plan' : 'Add lesson plan context'}
                  {lessonPlanContext.trim() && !showLessonPlan && (
                    <span className="text-primary/70 text-[10px]">(added)</span>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {showLessonPlan && (
                    <motion.div
                      key="lesson-plan"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <textarea
                        value={lessonPlanContext}
                        onChange={(e) => setLessonPlanContext(e.target.value)}
                        placeholder="Paste lesson plan or describe what the children are doing this week..."
                        disabled={isLoading || isRefining}
                        rows={4}
                        className="chat-input w-full resize-none text-sm mt-2"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Student Descriptions ── */}
              {activeChildren.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowStudentNotes((p) => !p)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading || isRefining}
                  >
                    <UserPen className="w-3.5 h-3.5" />
                    {showStudentNotes ? 'Hide student descriptions' : 'Add student descriptions'}
                    {Object.values(studentNotes).some((n) => n.trim()) && !showStudentNotes && (
                      <span className="text-primary/70 text-[10px]">(added)</span>
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {showStudentNotes && (
                      <motion.div
                        key="student-notes"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {activeChildren.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                disabled={isLoading || isRefining}
                                onClick={() => setActiveStudentNoteId((prev) => prev === child.id ? null : child.id)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all disabled:opacity-50 ${
                                  activeStudentNoteId === child.id
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-background/80 border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/30'
                                }`}
                              >
                                {child.name}
                                {studentNotes[child.id]?.trim() && (
                                  <span className={`w-1.5 h-1.5 rounded-full ${activeStudentNoteId === child.id ? 'bg-white/70' : 'bg-primary/60'}`} />
                                )}
                              </button>
                            ))}
                          </div>
                          {activeStudentNoteId && (
                            <textarea
                              value={studentNotes[activeStudentNoteId] ?? ''}
                              onChange={(e) => setStudentNotes((prev) => ({ ...prev, [activeStudentNoteId]: e.target.value }))}
                              placeholder={`Notes about ${activeChildren.find((c) => c.id === activeStudentNoteId)?.name ?? 'this student'}... e.g. was very engaged, asked many questions`}
                              disabled={isLoading || isRefining}
                              rows={3}
                              className="chat-input w-full resize-none text-sm"
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── Grade Selector ── */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary/40" />
                  Class Level
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(GRADE_LABELS) as Grade[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={isLoading || isRefining}
                      onClick={() => {
                        setSelectedGrade((prev) => prev === g ? null : g);
                        setSelectedGoalIds([]);
                        setExpandedGoalsPanel(false);
                        setExpandedCategories(new Set());
                        setExpandedGoals(new Set());
                      }}
                      className={gradeButtonClass(selectedGrade === g)}
                    >
                      {GRADE_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Learning Goals Panel ── */}
              {selectedGrade && (
                <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setExpandedGoalsPanel((p) => !p)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400/60" />
                      Learning Goals
                      {selectedGoalIds.length > 0 && (
                        <span className="ml-1.5 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {selectedGoalIds.length}
                        </span>
                      )}
                    </span>
                    {expandedGoalsPanel
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <AnimatePresence initial={false}>
                    {expandedGoalsPanel && (
                      <motion.div
                        key="goals-panel"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3.5 pb-3 space-y-3 border-t border-border/40 pt-2.5">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedGoalIds([])}
                              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                            >
                              Clear all
                            </button>
                          </div>
                          {ETON_CATEGORIES.map((cat) => {
                            const catGoals = getGoalsForGradeAndCategory(selectedGrade, cat.id);
                            if (catGoals.length === 0) return null;
                            const allSubGoalIdsInCat = catGoals.flatMap((g) => g.subGoals.map((sg) => sg.id));
                            const selectedInCat = allSubGoalIdsInCat.filter((id) => selectedGoalIds.includes(id));
                            const allSelectedInCat = allSubGoalIdsInCat.length > 0 && selectedInCat.length === allSubGoalIdsInCat.length;
                            const isOpen = expandedCategories.has(cat.id);
                            return (
                              <div key={cat.id} className="border border-border/30 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-left hover:bg-muted/30 transition-colors"
                                  onClick={() => setExpandedCategories((prev) => {
                                    const next = new Set(prev);
                                    next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                                    return next;
                                  })}
                                >
                                  <span>{cat.label}</span>
                                  <span className="flex items-center gap-2 shrink-0 ml-2">
                                    {selectedInCat.length > 0 && (
                                      <span className="text-[9px] font-bold text-primary">
                                        {selectedInCat.length}/{allSubGoalIdsInCat.length}
                                      </span>
                                    )}
                                    {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className="px-3 pb-2 space-y-1.5 border-t border-border/20">
                                    <button
                                      type="button"
                                      className="text-[10px] text-primary/70 hover:text-primary mt-1.5 mb-0.5 transition-colors"
                                      onClick={() => {
                                        if (allSelectedInCat) {
                                          setSelectedGoalIds((prev) => prev.filter((id) => !allSubGoalIdsInCat.includes(id)));
                                        } else {
                                          setSelectedGoalIds((prev) => [...new Set([...prev, ...allSubGoalIdsInCat])]);
                                        }
                                      }}
                                    >
                                      {allSelectedInCat ? 'Deselect all' : 'Select all'}
                                    </button>
                                    {catGoals.map((goal) => {
                                      if (goal.subGoals.length === 0) return null;
                                      const subGoalIds = goal.subGoals.map((sg) => sg.id);
                                      const selectedInGoal = subGoalIds.filter((id) => selectedGoalIds.includes(id));
                                      const allSelectedInGoal = selectedInGoal.length === subGoalIds.length;
                                      const isGoalOpen = expandedGoals.has(goal.id);
                                      return (
                                        <div key={goal.id} className="border border-border/20 rounded-md overflow-hidden">
                                          <button
                                            type="button"
                                            className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors"
                                            onClick={() => setExpandedGoals((prev) => {
                                              const next = new Set(prev);
                                              next.has(goal.id) ? next.delete(goal.id) : next.add(goal.id);
                                              return next;
                                            })}
                                          >
                                            <span className="flex items-center gap-1.5 min-w-0">
                                              <span className="font-mono text-[10px] text-primary/60 shrink-0">{goal.code}</span>
                                              <span className="text-[11px] text-muted-foreground truncate">{goal.label}</span>
                                            </span>
                                            <span className="flex items-center gap-1.5 shrink-0 ml-2">
                                              {selectedInGoal.length > 0 && (
                                                <span className="text-[9px] font-bold text-primary">
                                                  {selectedInGoal.length}
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                className="text-[9px] text-primary/50 hover:text-primary px-1 transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (allSelectedInGoal) {
                                                    setSelectedGoalIds((prev) => prev.filter((id) => !subGoalIds.includes(id)));
                                                  } else {
                                                    setSelectedGoalIds((prev) => [...new Set([...prev, ...subGoalIds])]);
                                                  }
                                                }}
                                              >
                                                {allSelectedInGoal ? '×' : 'all'}
                                              </button>
                                              {isGoalOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                            </span>
                                          </button>
                                          {isGoalOpen && (
                                            <div className="px-3 pb-2 space-y-0.5 border-t border-border/15 pt-1">
                                              {goal.subGoals.map((sg) => (
                                                <label key={sg.id} className="flex items-start gap-2 py-0.5 cursor-pointer group">
                                                  <input
                                                    type="checkbox"
                                                    checked={selectedGoalIds.includes(sg.id)}
                                                    onChange={(e) => {
                                                      setSelectedGoalIds((prev) =>
                                                        e.target.checked ? [...prev, sg.id] : prev.filter((id) => id !== sg.id)
                                                      );
                                                    }}
                                                    disabled={isLoading || isRefining}
                                                    className="mt-0.5 h-3.5 w-3.5 rounded border-border shrink-0"
                                                  />
                                                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground leading-snug transition-colors">
                                                    <span className="font-mono text-[10px] text-primary/60 mr-1">{sg.code}</span>
                                                    {sg.label}
                                                  </span>
                                                </label>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

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

              {/* ── Test Mode + Variable Inspector ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTestMode((p) => !p);
                      setShowVariableInspector((p) => !testMode ? p : false);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                      testMode
                        ? 'bg-amber-100 border-amber-400 text-amber-700'
                        : 'bg-background/80 border-border/70 text-muted-foreground hover:border-amber-400/50 hover:text-amber-600'
                    }`}
                  >
                    <FlaskConical className="w-3 h-3" />
                    Test Mode {testMode ? 'ON' : 'OFF'}
                  </button>
                  {testMode && (
                    <button
                      type="button"
                      onClick={() => setShowVariableInspector((p) => !p)}
                      className="text-[10px] text-amber-600 hover:text-amber-800 underline"
                    >
                      {showVariableInspector ? 'Hide' : 'Show'} variables
                    </button>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {testMode && showVariableInspector && (
                    <motion.div
                      key="var-inspector"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] space-y-1 font-mono">
                        <p className="font-bold text-amber-800 mb-2 font-sans">Variable Inspector</p>
                        {[
                          ['Grade', selectedGrade ? GRADE_LABELS[selectedGrade] : '—'],
                          ['Selected Goals', selectedGoalIds.length > 0
                            ? `${selectedGoalIds.length} selected`
                            : '—'],
                          ['Lesson Plan', lessonPlanContext.trim()
                            ? `${lessonPlanContext.trim().slice(0, 60)}${lessonPlanContext.trim().length > 60 ? '…' : ''}`
                            : '—'],
                          ['Child Names', childNames || '—'],
                          ['Context', context.trim()
                            ? `${context.trim().slice(0, 60)}${context.trim().length > 60 ? '…' : ''}`
                            : '—'],
                          ['Language', reportLanguage],
                          ['History Context', includeHistoryContext ? 'on' : 'off'],
                          ['Provider', currentProvider],
                        ].map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-amber-900">
                            <span className="text-amber-600 w-28 shrink-0">{k}</span>
                            <span className="text-amber-900 break-all">{v}</span>
                          </div>
                        ))}
                        {selectedGoalIds.length > 0 && (
                          <div className="pt-1 border-t border-amber-200/60">
                            <span className="text-amber-600">Goal IDs</span>
                            <div className="text-amber-900 mt-0.5 break-all">{selectedGoalIds.join(', ')}</div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
                    onClick={() => {
                      if (isGenerateSoftDisabled) {
                        setGenerateHintAttempted(true);
                        setTimeout(() => setGenerateHintAttempted(false), 2200);
                        return;
                      }
                      handleGenerate();
                    }}
                    disabled={isGenerateHardDisabled}
                    className={`w-full flex items-center justify-center gap-2.5 py-3.5 text-[15px] font-bold transition-all duration-200 ${
                      isGenerateDisabled ? 'opacity-40 cursor-not-allowed' : ''
                    } ${reportStatus === 'done' ? 'btn-secondary' : 'btn-primary'}`}
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

                  {isGenerateSoftDisabled && (
                    <motion.p
                      animate={generateHintAttempted ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
                      transition={{ duration: 0.28 }}
                      className={`text-[11px] px-1 transition-colors duration-200 ${generateHintAttempted ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                    >
                      {!activeFile
                        ? 'Upload a photo to enable generation.'
                        : 'Select at least one student in the Main Focus photo to enable generation.'}
                    </motion.p>
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
                isTestMode={testMode}
                grade={selectedGrade ? GRADE_LABELS[selectedGrade] : undefined}
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
