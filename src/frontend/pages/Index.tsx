import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, PenLine, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/frontend/components/Header";
import { ImageUpload, type UploadedPhoto } from "@/frontend/components/ImageUpload";
import { ReportPanel } from "@/frontend/components/ReportPanel";
import { SettingsPanel } from "@/frontend/components/SettingsPanel";
import { FaceTagPanel } from "@/frontend/components/FaceTagPanel";
import { StudentList } from "@/frontend/components/StudentList";
import { PhotoReview, type ScannedPhoto } from "@/frontend/components/PhotoReview";
import { analyzeImage, getVLMConfig, refineReport } from "@/backend/services/vlm";
import { parseReport, type ParsedReport } from "@/frontend/lib/parseReport";
import {
  fetchRecentReportsForStudent,
  type TaggedChild,
} from "@/frontend/lib/supabase";

export type ReportStatus = 'idle' | 'loading' | 'error' | 'done';

/* Decorative SVG elements for kid-friendly feel */
function DecoStars({ className }: { className?: string }) {
  return (
    <svg className={className} width="120" height="40" viewBox="0 0 120 40" fill="none">
      <circle cx="8" cy="8" r="3" fill="hsl(42,95%,65%)" opacity="0.4" />
      <circle cx="45" cy="30" r="2" fill="hsl(152,40%,49%)" opacity="0.3" />
      <circle cx="90" cy="12" r="2.5" fill="hsl(12,76%,61%)" opacity="0.3" />
      <circle cx="110" cy="32" r="1.5" fill="hsl(200,80%,65%)" opacity="0.35" />
      <path d="M25 18l1.5-3 3.2-1.5-3.2-1.5L25 9l-1.5 3-3.2 1.5 3.2 1.5z" fill="hsl(42,95%,65%)" opacity="0.5" />
      <path d="M70 6l1-2 2.1-1-2.1-1L70 0l-1 2-2.1 1 2.1 1z" fill="hsl(270,55%,70%)" opacity="0.4" />
    </svg>
  );
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

const Index = () => {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "students" ? "students" : "reports";

  const shiftPhotoIndexedRecord = <T,>(source: Record<number, T>, removedIndex: number): Record<number, T> => {
    const next: Record<number, T> = {};
    for (const [key, value] of Object.entries(source)) {
      const numericKey = Number(key);
      if (numericKey === removedIndex) continue;
      const nextKey = numericKey > removedIndex ? numericKey - 1 : numericKey;
      next[nextKey] = value;
    }
    return next;
  };

  // ── Shared report state ──────────────────────────────────
  const [context, setContext] = useState("");
  const [reportText, setReportText] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
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
    () => `${activityContext}__${activeStudentIdsKey}__${activeFileKey}`,
    [activityContext, activeStudentIdsKey, activeFileKey],
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
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
    setHistoryAssistNote(null);
    setLastGenerationFingerprint('');
  }, []);

  const handleClearAll = useCallback(() => {
    // Clear batch
    setBatchPhotos([]);
    setScannedResults([]);
    setPrimaryPhotoIndex(0);
    setExcludedStudentIdsByPhoto({});
    setManuallyAddedStudentsByPhoto({});
    // Clear legacy
    setSelectedImage(null);
    setImageFile(null);
    setTaggedChildren([]);
    // Clear report
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
    setRefinePrompt('');
    setHistoryAssistNote(null);
    setLastGenerationFingerprint('');
  }, []);

  const handleBatchSelect = useCallback((photos: UploadedPhoto[]) => {
    setBatchPhotos(photos);
    setScannedResults([]);
    setPrimaryPhotoIndex(0);
    setExcludedStudentIdsByPhoto({});
    setManuallyAddedStudentsByPhoto({});
    // Clear legacy single-photo state
    setSelectedImage(null);
    setImageFile(null);
    setTaggedChildren([]);
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
    setHistoryAssistNote(null);
    setLastGenerationFingerprint('');
  }, []);

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
      let historicalSummary: string | undefined;

      if (includeHistoryContext) {
        if (config.provider === 'colab') {
          setHistoryAssistNote('History assist is unavailable on Colab mode. Using Activity Context only.');
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
            undefined,
            { historicalSummary: summaryOverride },
          );

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('Generation timed out after 90 seconds. Please retry or switch provider in Settings.'));
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
          throw new Error('Model returned an empty response. Please retry, or switch provider in Settings.');
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
    } finally {
      // No-op: per-attempt timeout cleanup is handled inside runAttempt.
    }
  }, [
    activeChildren.length,
    activeFile,
    activityContext,
    buildHistoricalSummary,
    childNames,
    currentGenerationFingerprint,
    includeHistoryContext,
  ]);

  const isLoading = reportStatus === 'loading';

  const handleFollowUp = useCallback(async () => {
    if (!reportText || isRefining || !refinePrompt.trim()) return;

    if (hasGenerationInputChanged) {
      setReportError('Activity context or selected students changed. Generate again before refining.');
      return;
    }

    const currentReport = reportText;
    setIsRefining(true);
    setReportError(null);
    setReportText('');
    setReportStatus('loading');

    try {
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
  }, [reportText, isRefining, refinePrompt, childNames, activeFile, hasGenerationInputChanged]);

  const handleReportEdit = useCallback((updated: ParsedReport) => {
    setReportText(updated.raw);
  }, []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Warm decorative background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[hsl(12,76%,61%,0.03)] blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-[400px] h-[400px] rounded-full bg-[hsl(152,40%,49%,0.03)] blur-3xl" />
        <div className="absolute -bottom-20 right-1/4 w-[350px] h-[350px] rounded-full bg-[hsl(42,95%,65%,0.04)] blur-3xl" />
      </div>

      <Header onSettingsOpen={() => setIsSettingsOpen(true)} />
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="relative z-10 h-[calc(100vh-4rem)] pt-16 pb-16 md:pb-0">
        {/* Reports View */}
        {activeTab === "reports" && (
          <div className="h-full flex flex-col md:flex-row">
            {/* Left Panel — Upload + Inputs */}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full md:w-[420px] lg:w-[460px] md:min-w-[360px] h-auto md:h-full p-5 md:p-6 flex flex-col gap-5 md:border-r border-border/50 overflow-y-auto bg-white/40"
            >
              {/* Section heading */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DecoStars className="hidden md:block" />
                </div>
              </div>

              {/* ── Upload or PhotoReview ──────────────────── */}
              {isBatchMode ? (
                <PhotoReview
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

                  <FaceTagPanel
                    imageFile={imageFile}
                    imagePreview={selectedImage}
                    onTagsChange={setTaggedChildren}
                  />
                </>
              )}

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
                  rows={4}
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
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border/70 bg-white/70 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
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
              <div className="sticky bottom-0 mt-auto pt-2 -mx-2 px-2 pb-1 bg-gradient-to-t from-[hsl(38,50%,97%,0.98)] via-[hsl(38,50%,97%,0.92)] to-transparent backdrop-blur-sm">
                <div className="rounded-2xl border border-border/50 bg-white/70 p-3 space-y-2.5">
                  {hasGenerationInputChanged && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2">
                      Activity context or selected students changed. Generate again to apply updates.
                    </p>
                  )}

                  {historyAssistNote && !isLoading && (
                    <p className="text-[11px] text-muted-foreground px-1">
                      {historyAssistNote}
                    </p>
                  )}

                  {reportStatus === 'done' && (
                    <button
                      onClick={handleFollowUp}
                      disabled={!refinePrompt.trim() || isRefining || hasGenerationInputChanged}
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
                    disabled={!activeFile || activeChildren.length === 0 || isLoading || isRefining}
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
                        {hasGenerationInputChanged ? 'Apply Updated Context' : 'Re-generate'}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Report
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

            {/* Right Panel — Always Report */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex-1 md:h-full p-4 md:p-6 flex flex-col min-h-0"
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
          <div className="h-full overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 md:p-6">
              <StudentList />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
