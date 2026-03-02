import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, MapPin, Eye, Target, FileText } from "lucide-react";
import { ParsedReport, DOMAIN_COLORS } from "@/frontend/lib/parseReport";

interface ObservationReportProps {
  report: ParsedReport;
  isStreaming: boolean;
  childName?: string;
}

const StreamingCursor = () => (
  <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse rounded-sm align-middle" />
);

export function ObservationReport({ report, isStreaming, childName }: ObservationReportProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasContext = report.context.length > 0;
  const hasObservation = report.observation.length > 0;
  const hasDomains = report.learningDomains.length > 0;
  const hasAnySections = hasContext || hasObservation || hasDomains;

  return (
    <div className="space-y-5">
      {/* Report Header + Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">
          Observation Report
        </h2>
        {!isStreaming && hasAnySections && (
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
          </div>
        )}
      </div>

      {/* Date footer */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        Generated on: <span className="font-semibold text-foreground">
          {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
        </span>
        {childName && (
          <> · {childName.includes(',') ? 'Children' : 'Child'}: <span className="font-semibold text-foreground">{childName}</span></>
        )}
      </div>

      {/* Context Section */}
      {hasContext && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-secondary/30">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Context</span>
          </div>
          <div className="px-4 py-4">
            <p className="text-sm leading-7 text-foreground">
              {report.context}
              {isStreaming && !hasObservation && <StreamingCursor />}
            </p>
          </div>
        </motion.div>
      )}

      {/* Observation Section */}
      {hasObservation && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-secondary/30">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Observation</span>
          </div>
          <div className="px-4 py-4">
            <p className="observation-narrative text-[15px] text-foreground">
              {report.observation}
              {isStreaming && !hasDomains && <StreamingCursor />}
            </p>
          </div>
        </motion.div>
      )}

      {/* Learning Goals Section */}
      {hasDomains && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-secondary/30">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Learning Goals</span>
          </div>
          <div className="px-4 py-4 space-y-3">
            {report.learningDomains.map((domain, i) => {
              const colors = DOMAIN_COLORS[domain.name] || { bg: '#F5F5F5', border: '#DDD', dot: '#999' };

              return (
                <motion.div
                  key={domain.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1.5px solid ${colors.border}` }}
                >
                  {/* Domain Header */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-foreground"
                    style={{ background: colors.bg }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: colors.dot }}
                    />
                    {domain.name}
                  </div>

                  {/* Goals */}
                  <div className="px-4 py-3 space-y-2.5 bg-card">
                    {domain.goals.map((goal, j) => (
                      <div key={j} className="space-y-1">
                        <p className="text-[12px] font-semibold text-muted-foreground tracking-wide">
                          Learning Goal
                        </p>
                        {goal.goal && (
                          <p className="text-[13px] font-medium text-foreground/80">
                            {goal.goal}
                          </p>
                        )}
                        {goal.ksdStatement && (
                          <p
                            className="text-[13px] text-foreground leading-relaxed mt-0.5 pl-3"
                            style={{ borderLeft: `2px solid ${colors.border}` }}
                          >
                            {goal.ksdStatement}
                          </p>
                        )}
                      </div>
                    ))}
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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-secondary/30">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Report</span>
          </div>
          <div className="px-4 py-4">
            <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">
              {report.raw}
              <StreamingCursor />
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
