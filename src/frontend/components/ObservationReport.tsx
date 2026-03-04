import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, ChevronLeft, ChevronRight, Send, Loader2 } from "lucide-react";
import { ParsedReport, CATEGORY_COLORS } from "@/frontend/lib/parseReport";
import { publishReport, uploadReportImage, type TaggedChild } from "@/frontend/lib/supabase";
import { toast } from "sonner";

interface ObservationReportProps {
  report: ParsedReport;
  isStreaming: boolean;
  childName?: string;
  taggedChildren?: TaggedChild[];
  imagePreview?: string | null;
  imageFile?: File | null;
}

const StreamingCursor = () => (
  <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse rounded-sm align-middle" />
);

export function ObservationReport({ report, isStreaming, childName, taggedChildren, imagePreview, imageFile }: ObservationReportProps) {
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = async () => {
    if (publishing || published) return;
    setPublishing(true);
    try {
      const primaryChild = taggedChildren?.[0];
      let permanentImageUrl: string | null = null;
      if (imageFile) {
        permanentImageUrl = await uploadReportImage(imageFile);
      }
      await publishReport({
        title: `Moments : ${report.context || 'Classroom Observation'}`,
        student_name: childName || 'Unknown',
        class_group: primaryChild?.class_group || '',
        image_url: permanentImageUrl,
        context: report.context,
        observation: report.observation,
        learning_analysis: report.learningAnalysis,
        report_raw: report.raw,
      });
      setPublished(true);
      toast.success('Report published to feed!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish report');
    } finally {
      setPublishing(false);
    }
  };

  const hasContext = report.context.length > 0;
  const hasObservation = report.observation.length > 0;
  const hasAnalysis = report.learningAnalysis.length > 0;
  const hasAnySections = hasContext || hasObservation || hasAnalysis;
  const isDone = !isStreaming && hasAnySections;

  const primaryChild = taggedChildren?.[0];
  const displayTitle = report.context
    ? `Moments : ${report.context.length > 60 ? report.context.slice(0, 60) + '...' : report.context}`
    : 'Moments : Classroom Observation';

  return (
    <div className="space-y-0">
      {/* Report Title */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-4 border-b border-border"
      >
        <h2 className="text-lg font-bold text-foreground">{displayTitle}</h2>
      </motion.div>

      {/* Student Info Bar — "Showing to:" */}
      {primaryChild && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="px-4 py-3 bg-secondary/30 border-b border-border"
        >
          <div className="text-xs text-muted-foreground mb-1">
            Showing to:
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block px-2.5 py-1 rounded-md bg-accent/10 text-accent text-xs font-medium">
              {primaryChild.class_group || 'Class'}
            </span>
            <span className="inline-block px-2.5 py-1 rounded-md bg-accent/10 text-accent text-xs font-medium">
              {primaryChild.name}
            </span>
          </div>

          {/* Student Information */}
          <div className="mt-3 text-xs text-muted-foreground">
            <span className="font-semibold">Student Information:</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs">
            <div>
              <span className="text-accent font-medium">Name</span>{' '}
              <span className="text-foreground">{primaryChild.name}</span>
            </div>
            <div>
              <span className="text-accent font-medium">Class</span>{' '}
              <span className="text-foreground">{primaryChild.class_group || '—'}</span>
            </div>
          </div>

          {/* Show all tagged children if multiple */}
          {taggedChildren && taggedChildren.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {taggedChildren.slice(1).map((child) => (
                <span
                  key={child.id}
                  className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px]"
                >
                  {child.name}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Photo Section */}
      {imagePreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="relative flex items-center justify-center bg-gray-50 border-b border-border"
        >
          <img
            src={imagePreview}
            alt="Classroom observation"
            className="max-h-[300px] w-auto object-contain"
          />
          {/* Navigation arrows (decorative, matching screenshot) */}
          <button className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 border border-border flex items-center justify-center hover:bg-white transition-colors">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 border border-border flex items-center justify-center hover:bg-white transition-colors">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </motion.div>
      )}

      {/* Context Section */}
      {hasContext && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="px-5 py-4 border-b border-border"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Context:</h3>
          <p className="text-sm leading-relaxed text-foreground">
            {report.context}
            {isStreaming && !hasObservation && <StreamingCursor />}
          </p>
        </motion.div>
      )}

      {/* Observation Section */}
      {hasObservation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="px-5 py-4 border-b border-border"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Observation:</h3>
          <p className="text-sm leading-7 text-foreground whitespace-pre-line">
            {report.observation}
            {isStreaming && !hasAnalysis && <StreamingCursor />}
          </p>
        </motion.div>
      )}

      {/* Learning Analysis Section */}
      {hasAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="px-5 py-4 border-b border-border"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Learning Analysis:</h3>
          <div className="space-y-3">
            {report.learningAnalysis.map((item, i) => {
              const colors = CATEGORY_COLORS[item.category] || { bg: '#F5F5F5', border: '#DDD', dot: '#999' };
              return (
                <motion.div
                  key={item.category}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.2 + i * 0.04 }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: colors.dot }}
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground">{item.category}:</span>{' '}
                      <span className="text-sm text-foreground/80 leading-relaxed">{item.description}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {isStreaming && (
              <div className="flex items-center gap-2 pt-1">
                <StreamingCursor />
                <span className="text-xs text-muted-foreground">Generating...</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Fallback: raw text if nothing parsed yet */}
      {!hasAnySections && isStreaming && (
        <div className="px-5 py-4">
          <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">
            {report.raw}
            <StreamingCursor />
          </p>
        </div>
      )}

      {/* Footer: Actions */}
      {isDone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="px-5 py-4 flex items-center justify-between"
        >
          <div className="text-xs text-muted-foreground">
            Generated on{' '}
            <span className="font-semibold text-foreground">
              {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:border-primary hover:text-primary transition-all"
            >
              {copied ? (
                <><Check className="w-3 h-3" /> Copied</>
              ) : (
                <><Copy className="w-3 h-3" /> Copy</>
              )}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || published}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                published
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-primary text-primary-foreground hover:opacity-90'
              } disabled:opacity-60`}
            >
              {publishing ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Publishing...</>
              ) : published ? (
                <><Check className="w-3 h-3" /> Published</>
              ) : (
                <><Send className="w-3 h-3" /> Publish</>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
