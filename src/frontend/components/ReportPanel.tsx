import { motion } from "framer-motion";
import { Loader2, FileText, AlertTriangle, RefreshCw } from "lucide-react";
import { ObservationReport } from "./ObservationReport";
import { parseReport } from "@/frontend/lib/parseReport";
import type { ReportStatus } from "@/frontend/pages/Index";

interface ReportPanelProps {
  reportText: string;
  status: ReportStatus;
  error: string | null;
  onRetry: () => void;
  childName: string;
  isStreaming: boolean;
}

export function ReportPanel({
  reportText,
  status,
  error,
  onRetry,
  childName,
  isStreaming,
}: ReportPanelProps) {
  const parsedReport = reportText ? parseReport(reportText) : null;
  const showReport = (status === 'loading' && reportText.length > 0) || status === 'done';

  return (
    <div className="flex flex-col h-full panel-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <FileText className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Observation Report</h2>
            <p className="text-[11px] text-muted-foreground">Developmental insights</p>
          </div>
        </div>
        {status === 'loading' && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs text-primary font-semibold">Analysing...</span>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5 min-h-0">
        {/* Idle State */}
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
              <FileText className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-lg font-semibold text-foreground/50">
              No report yet
            </p>
            <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
              Upload an image, fill in the child's name and activity context, then generate a report.
            </p>
          </div>
        )}

        {/* Loading State (no text yet) */}
        {status === 'loading' && reportText.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-12 h-12 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin"
            />
            <div className="space-y-2">
              <p className="text-[15px] font-medium text-foreground">
                Analysing image...
              </p>
              <p className="text-[13px] text-muted-foreground">
                This may take 30–60 seconds
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && error && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <p className="text-lg font-semibold text-foreground/50">
              Connection failed
            </p>
            <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed">
              {error}
            </p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              Check your ngrok URL in Settings and make sure your Colab server is running.
            </p>
            <button
              onClick={onRetry}
              className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          </div>
        )}

        {/* Report View */}
        {showReport && parsedReport && (
          <ObservationReport
            report={parsedReport}
            isStreaming={isStreaming}
            childName={childName}
          />
        )}
      </div>
    </div>
  );
}
