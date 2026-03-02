import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Settings, Loader2 } from "lucide-react";
import { Header } from "@/frontend/components/Header";
import { ImageUpload } from "@/frontend/components/ImageUpload";
import { ReportPanel } from "@/frontend/components/ReportPanel";
import { SettingsPanel } from "@/frontend/components/SettingsPanel";
import { analyzeImage } from "@/backend/services/vlm";

export type ReportStatus = 'idle' | 'loading' | 'error' | 'done';

const Index = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [childName, setChildName] = useState("");
  const [context, setContext] = useState("");
  const [reportText, setReportText] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleImageSelect = useCallback((file: File, preview: string) => {
    setSelectedImage(preview);
    setImageFile(file);
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
  }, []);

  const handleClearImage = useCallback(() => {
    setSelectedImage(null);
    setImageFile(null);
    setReportText('');
    setReportStatus('idle');
    setReportError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedImage || !imageFile || !childName.trim()) return;

    setReportText('');
    setReportError(null);
    setReportStatus('loading');

    try {
      await analyzeImage(imageFile, childName.trim(), context.trim() || "Classroom activity", (chunk) => {
        setReportText((prev) => prev + chunk);
      });
      setReportStatus('done');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setReportError(errorMsg);
      setReportStatus('error');
    }
  }, [selectedImage, imageFile, childName, context]);

  const isLoading = reportStatus === 'loading';

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Settings Button */}
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="fixed top-4 right-4 z-30 p-2.5 rounded-xl bg-secondary/80 hover:bg-secondary border border-border shadow-sm transition-colors"
        title="Settings"
      >
        <Settings className="w-5 h-5 text-muted-foreground" />
      </button>

      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <main className="h-[calc(100vh-3.5rem)] pt-14">
        <div className="h-full flex flex-col md:flex-row">
          {/* Left Panel — Image + Inputs (1/3 width) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full md:w-2/5 md:min-w-[320px] h-auto md:h-full p-4 md:p-6 flex flex-col gap-5 md:border-r border-border overflow-y-auto"
          >
            {/* Image Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Classroom Image
                </label>
                {selectedImage && (
                  <button
                    onClick={handleClearImage}
                    className="text-xs text-primary hover:underline"
                  >
                    Change image
                  </button>
                )}
              </div>
              <div className="min-h-0">
                {selectedImage ? (
                  <div className="panel-card overflow-hidden rounded-xl">
                    <img
                      src={selectedImage}
                      alt="Uploaded preview"
                      className="w-full object-cover"
                      style={{ maxHeight: 280 }}
                    />
                  </div>
                ) : (
                  <ImageUpload
                    onImageSelect={handleImageSelect}
                    selectedImage={selectedImage}
                    onClear={handleClearImage}
                  />
                )}
              </div>
            </div>

            {/* Input Fields */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1.5 block">
                  Child's Name
                </label>
                <input
                  type="text"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="e.g. Liam"
                  disabled={isLoading}
                  className="chat-input w-full text-sm h-10"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground/70 mb-1.5 block">
                  Activity Context
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Describe the ongoing project or context. e.g. Over several days, children have been working with clay to create sea turtles..."
                  disabled={isLoading}
                  rows={3}
                  className="chat-input w-full resize-none text-sm"
                />
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!selectedImage || !childName.trim() || isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none mt-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Report"
              )}
            </button>
          </motion.div>

          {/* Right Panel — Report (2/3 width) */}
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
              childName={childName}
              isStreaming={reportStatus === 'loading' && reportText.length > 0}
            />
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Index;
