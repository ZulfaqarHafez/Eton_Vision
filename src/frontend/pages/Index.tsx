import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, PenLine, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/frontend/components/Header";
import { ImageUpload } from "@/frontend/components/ImageUpload";
import { ReportPanel } from "@/frontend/components/ReportPanel";
import { SettingsPanel } from "@/frontend/components/SettingsPanel";
import { FaceTagPanel } from "@/frontend/components/FaceTagPanel";
import { StudentList } from "@/frontend/components/StudentList";
import { analyzeImage, refineReport } from "@/backend/services/vlm";
import { parseReport, type ParsedReport } from "@/frontend/lib/parseReport";
import type { TaggedChild } from "@/frontend/lib/supabase";

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

const Index = () => {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "students" ? "students" : "reports";

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [taggedChildren, setTaggedChildren] = useState<TaggedChild[]>([]);
  const [context, setContext] = useState("");
  const [reportText, setReportText] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");

  const childNames = taggedChildren.map((c) => c.name).join(', ');

  const handleImageSelect = useCallback((file: File, preview: string) => {
    setSelectedImage(preview);
    setImageFile(file);
    setTaggedChildren([]);
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
  }, []);

  const handleClearImage = useCallback(() => {
    setSelectedImage(null);
    setImageFile(null);
    setTaggedChildren([]);
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedImage || !imageFile || taggedChildren.length === 0) return;

    console.log('[Generate] Starting report generation...');
    console.log('[Generate] Provider:', (() => { try { const c = JSON.parse(localStorage.getItem('vlm_config') || '{}'); return c.provider || 'colab'; } catch { return 'colab'; } })());
    console.log('[Generate] Child names:', childNames);
    console.log('[Generate] Context:', context.trim() || 'Classroom activity');

    setReportText('');
    setReportError(null);
    setReportStatus('loading');

    try {
      await analyzeImage(imageFile, childNames, context.trim() || "Classroom activity", (chunk) => {
        setReportText((prev) => prev + chunk);
      });
      console.log('[Generate] Done.');
      setReportStatus('done');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Generate] Error:', errorMsg);
      setReportError(errorMsg);
      setReportStatus('error');
    }
  }, [selectedImage, imageFile, taggedChildren, childNames, context]);

  const isLoading = reportStatus === 'loading';

  const handleFollowUp = useCallback(async () => {
    if (!reportText || isRefining || !refinePrompt.trim()) return;

    console.log('[Refine] Starting refinement with prompt:', refinePrompt);

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
        imageFile,
        (chunk) => {
          setReportText((prev) => prev + chunk);
        }
      );
      console.log('[Refine] Done.');
      setReportStatus('done');
      setRefinePrompt('');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Refine] Error:', errorMsg);
      setReportError(errorMsg);
      setReportStatus('error');
    } finally {
      setIsRefining(false);
    }
  }, [reportText, isRefining, refinePrompt, childNames, imageFile]);

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

              {/* Image upload / face tagging */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary/60" />
                    Classroom Photo
                  </label>
                  {selectedImage && (
                    <button
                      onClick={handleClearImage}
                      className="text-xs text-primary hover:underline font-bold py-1 px-2 rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      Change photo
                    </button>
                  )}
                </div>
                {!selectedImage && (
                  <ImageUpload
                    onImageSelect={handleImageSelect}
                    selectedImage={selectedImage}
                    onClear={handleClearImage}
                  />
                )}
              </div>

              <FaceTagPanel
                imageFile={imageFile}
                imagePreview={selectedImage}
                onTagsChange={setTaggedChildren}
              />

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
                  rows={3}
                  className="chat-input w-full resize-none text-sm"
                />
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
              <div className="flex flex-col gap-2.5 mt-auto pt-2">
                {reportStatus === 'done' && (
                  <button
                    onClick={handleFollowUp}
                    disabled={!refinePrompt.trim() || isRefining}
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
                  disabled={!selectedImage || taggedChildren.length === 0 || isLoading}
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
                      Re-generate
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Report
                    </>
                  )}
                </button>
              </div>
            </motion.div>

            {/* Right Panel — Report */}
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
                taggedChildren={taggedChildren}
                imagePreview={selectedImage}
                imageFile={imageFile}
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
