import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
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

    // Save current report before clearing so we can send it to the API
    const currentReport = reportText;

    setIsRefining(true);
    setReportError(null);
    // Clear report text so the user sees streaming result
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
    <div className="min-h-screen bg-background">
      <Header onSettingsOpen={() => setIsSettingsOpen(true)} />
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="h-[calc(100vh-4rem)] pt-16 pb-16 md:pb-0">
        {/* Reports View */}
        {activeTab === "reports" && (
          <div className="h-full flex flex-col md:flex-row">
            {/* Left Panel — Image + Inputs */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full md:w-2/5 md:min-w-[340px] h-auto md:h-full p-4 md:p-6 flex flex-col gap-5 md:border-r border-border overflow-y-auto"
            >
              {/* Image Section + Face Tagging */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Classroom Image
                  </label>
                  {selectedImage && (
                    <button
                      onClick={handleClearImage}
                      className="text-sm text-primary hover:underline font-medium py-1 px-2"
                    >
                      Change image
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

              {/* Face Tag Panel — shows image with bounding boxes + tagged students */}
              <FaceTagPanel
                imageFile={imageFile}
                imagePreview={selectedImage}
                onTagsChange={setTaggedChildren}
              />

              {/* Activity Context — always visible */}
              <div>
                <label className="text-sm font-semibold text-foreground/70 mb-1.5 block">
                  Activity Context
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Describe the ongoing project or context. e.g. Over several days, children have been working with clay to create sea turtles..."
                  disabled={isLoading || isRefining}
                  rows={3}
                  className="chat-input w-full resize-none text-base"
                />
              </div>

              {/* Refine Report — shown after report is done */}
              {reportStatus === 'done' && (
                <div>
                  <label className="text-sm font-semibold text-foreground/70 mb-1.5 block">
                    Refine Report
                  </label>
                  <textarea
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    placeholder="e.g. Make the observation more detailed, add more about collaboration..."
                    disabled={isRefining}
                    rows={2}
                    className="chat-input w-full resize-none text-base"
                  />
                  {reportError && (
                    <p className="text-xs text-destructive mt-1.5 px-1">{reportError}</p>
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex flex-col gap-2 mt-auto">
                {reportStatus === 'done' && (
                  <button
                    onClick={handleFollowUp}
                    disabled={!refinePrompt.trim() || isRefining}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isRefining ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Refining...
                      </>
                    ) : (
                      "Refine Report"
                    )}
                  </button>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={!selectedImage || taggedChildren.length === 0 || isLoading}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none ${
                    reportStatus === 'done'
                      ? 'border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors'
                      : 'btn-primary'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : reportStatus === 'done' ? (
                    "Re-generate Report"
                  ) : (
                    "Generate Report"
                  )}
                </button>
              </div>
            </motion.div>

            {/* Right Panel — Report */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
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
