import { motion } from "framer-motion";
import { Loader2, FileText, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { ObservationReport } from "./ObservationReport";
import { parseReport, type ParsedReport } from "@/frontend/lib/parseReport";
import type { ReportStatus } from "@/frontend/pages/Index";
import type { TaggedChild } from "@/frontend/lib/supabase";

interface ReportPanelProps {
  reportText: string;
  status: ReportStatus;
  error: string | null;
  onRetry: () => void;
  childName: string;
  isStreaming: boolean;
  taggedChildren?: TaggedChild[];
  imagePreview?: string | null;
  imageFile?: File | null;
  onReportEdit?: (updated: ParsedReport) => void;
}

/* Illustration: a friendly open book with a star */
function EmptyIllustration() {
  return (
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Book body */}
      <path d="M30 90 L70 80 L110 90 L110 35 L70 25 L30 35 Z" fill="hsl(38,50%,95%)" stroke="hsl(35,25%,82%)" strokeWidth="1.5"/>
      {/* Book spine */}
      <line x1="70" y1="25" x2="70" y2="80" stroke="hsl(35,25%,82%)" strokeWidth="1.5"/>
      {/* Left page lines */}
      <line x1="40" y1="45" x2="64" y2="39" stroke="hsl(35,20%,85%)" strokeWidth="1"/>
      <line x1="40" y1="55" x2="64" y2="49" stroke="hsl(35,20%,85%)" strokeWidth="1"/>
      <line x1="40" y1="65" x2="64" y2="59" stroke="hsl(35,20%,85%)" strokeWidth="1"/>
      {/* Right page lines */}
      <line x1="76" y1="39" x2="100" y2="45" stroke="hsl(35,20%,85%)" strokeWidth="1"/>
      <line x1="76" y1="49" x2="100" y2="55" stroke="hsl(35,20%,85%)" strokeWidth="1"/>
      {/* Star decoration */}
      <path d="M95 18 L97.5 12 L102 9.5 L97.5 7 L95 1 L92.5 7 L88 9.5 L92.5 12 Z" fill="hsl(42,95%,65%)" opacity="0.7"/>
      <circle cx="42" cy="22" r="3" fill="hsl(12,76%,61%)" opacity="0.3"/>
      <circle cx="108" cy="28" r="2" fill="hsl(152,40%,49%)" opacity="0.3"/>
      {/* Pencil */}
      <rect x="112" y="55" width="4" height="30" rx="1" transform="rotate(-20 112 55)" fill="hsl(42,90%,65%)" stroke="hsl(42,70%,50%)" strokeWidth="0.8"/>
      <polygon points="108,82 110,88 114,84" fill="hsl(20,70%,50%)" transform="rotate(-20 112 55)"/>
    </svg>
  );
}

function LoadingIllustration() {
  return (
    <div className="relative">
      <div className="w-16 h-16 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary/50" />
    </div>
  );
}

export function ReportPanel({
  reportText,
  status,
  error,
  onRetry,
  childName,
  isStreaming,
  taggedChildren,
  imagePreview,
  imageFile,
  onReportEdit,
}: ReportPanelProps) {
  const parsedReport = reportText ? parseReport(reportText) : null;
  const showReport = (status === 'loading' && reportText.length > 0) || status === 'done';

  return (
    <div className="flex flex-col h-full panel-card overflow-hidden">
      {/* Header — warm, portfolio-like */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-gradient-to-r from-white/80 to-[hsl(38,50%,97%)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/90 to-[hsl(20,85%,68%)] flex items-center justify-center shadow-sm">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-[15px] font-extrabold text-foreground font-display">Observation Report</h2>
            <p className="text-[11px] text-muted-foreground font-medium">Moments of learning & growth</p>
          </div>
        </div>
        {status === 'loading' && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-primary/8 rounded-full border border-primary/10">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs text-primary font-bold">Writing...</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Idle — warm empty state */}
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-4 px-6">
            <EmptyIllustration />
            <div className="space-y-2">
              <p className="text-xl font-extrabold text-foreground/50 font-display">
                Ready to observe!
              </p>
              <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed">
                Upload a classroom photo, tag the children, add some context — then let the magic happen.
              </p>
            </div>
          </div>
        )}

        {/* Loading (no text yet) */}
        {status === 'loading' && reportText.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-6 px-6">
            <LoadingIllustration />
            <div className="space-y-2">
              <p className="text-[15px] font-bold text-foreground font-display">
                Observing the moment...
              </p>
              <p className="text-sm text-muted-foreground">
                Crafting a thoughtful report — this may take a minute
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-4 px-6">
            <div className="w-16 h-16 rounded-2xl bg-destructive/8 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive/70" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-extrabold text-foreground/60 font-display">
                Oops, something went wrong
              </p>
              <p className="text-sm text-muted-foreground max-w-[320px] leading-relaxed">
                {error}
              </p>
            </div>
            <button
              onClick={onRetry}
              className="mt-2 btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          </div>
        )}

        {/* Report */}
        {showReport && parsedReport && (
          <ObservationReport
            report={parsedReport}
            isStreaming={isStreaming}
            childName={childName}
            taggedChildren={taggedChildren}
            imagePreview={imagePreview}
            imageFile={imageFile}
            onReportEdit={onReportEdit}
          />
        )}
      </div>
    </div>
  );
}
