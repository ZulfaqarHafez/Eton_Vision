import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Settings, Loader2, FileText, Users } from "lucide-react";
import { Header } from "@/frontend/components/Header";
import { ImageUpload } from "@/frontend/components/ImageUpload";
import { ReportPanel } from "@/frontend/components/ReportPanel";
import { SettingsPanel } from "@/frontend/components/SettingsPanel";
import { FaceTagPanel } from "@/frontend/components/FaceTagPanel";
import { StudentList } from "@/frontend/components/StudentList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frontend/components/ui/tabs";
import { analyzeImage } from "@/backend/services/vlm";
import type { TaggedChild } from "@/frontend/lib/supabase";

export type ReportStatus = 'idle' | 'loading' | 'error' | 'done';

const Index = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [taggedChildren, setTaggedChildren] = useState<TaggedChild[]>([]);
  const [context, setContext] = useState("");
  const [reportText, setReportText] = useState('');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

    setReportText('');
    setReportError(null);
    setReportStatus('loading');

    try {
      await analyzeImage(imageFile, childNames, context.trim() || "Classroom activity", (chunk) => {
        setReportText((prev) => prev + chunk);
      });
      setReportStatus('done');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setReportError(errorMsg);
      setReportStatus('error');
    }
  }, [selectedImage, imageFile, taggedChildren, childNames, context]);

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
        <Tabs defaultValue="reports" className="h-full flex flex-col">
          <div className="px-4 md:px-6 pt-3 border-b border-border bg-card/50">
            <TabsList className="bg-transparent gap-1 p-0 h-auto">
              <TabsTrigger
                value="reports"
                className="rounded-t-lg rounded-b-none border border-b-0 border-transparent data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-none px-4 py-2 gap-1.5 text-sm"
              >
                <FileText className="w-4 h-4" />
                Reports
              </TabsTrigger>
              <TabsTrigger
                value="students"
                className="rounded-t-lg rounded-b-none border border-b-0 border-transparent data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-none px-4 py-2 gap-1.5 text-sm"
              >
                <Users className="w-4 h-4" />
                Students
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Reports Tab */}
          <TabsContent value="reports" className="flex-1 mt-0 min-h-0">
            <div className="h-full flex flex-col md:flex-row">
              {/* Left Panel — Image + Inputs */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full md:w-2/5 md:min-w-[320px] h-auto md:h-full p-4 md:p-6 flex flex-col gap-5 md:border-r border-border overflow-y-auto"
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
                        className="text-xs text-primary hover:underline"
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

                {/* Activity Context */}
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

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={!selectedImage || taggedChildren.length === 0 || isLoading}
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
                />
              </motion.div>
            </div>
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="flex-1 mt-0 min-h-0 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-4 md:p-6">
              <StudentList />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
