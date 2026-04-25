import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Send, Loader2, Pencil, X, Calendar, User } from "lucide-react";
import {
  CATEGORY_COLORS,
  REPORT_SECTION_LABELS,
  type LearningAnalysisItem,
  type ParsedReport,
} from "../lib/parseReport";
import { publishReport, uploadReportImage, type TaggedChild } from "@/frontend/lib/supabase";
import { toast } from "sonner";

interface ObservationReportProps {
  report: ParsedReport;
  isStreaming: boolean;
  childName?: string;
  taggedChildren?: TaggedChild[];
  imagePreview?: string | null;
  imageFile?: File | null;
  onReportEdit?: (updated: ParsedReport) => void;
  isTestMode?: boolean;
}

const StreamingCursor = () => (
  <span className="inline-block w-1.5 h-5 bg-primary/70 ml-0.5 animate-pulse rounded-sm align-middle" />
);

// Category badge colors — pastel, kid-friendly
const BADGE_STYLES: Record<string, string> = {
  // Eton categories (EN)
  'The Social Child':                                       'bg-[#F0FFF4] text-[#2E8B4E] border-[#B5E8C8]',
  'The Child as a Communicator':                            'bg-[#EEF6FF] text-[#3B7DD8] border-[#BFD9F5]',
  'The Thinking Child':                                     'bg-[#FFF8EC] text-[#B8860B] border-[#F0DCA0]',
  'The Physical Child':                                     'bg-[#FFE8EE] text-[#C94060] border-[#F0B5C5]',
  'Creative Expression and Enjoyment through the Arts':     'bg-[#FDF0FF] text-[#9A3DC8] border-[#E4BFF5]',
  'The Child as an Agent of Change':                        'bg-[#FFF3EC] text-[#D06830] border-[#F5D0B5]',
  // Eton categories (ZH)
  '社会背景下的儿童':                                        'bg-[#F0FFF4] text-[#2E8B4E] border-[#B5E8C8]',
  '善交流的儿童':                                            'bg-[#EEF6FF] text-[#3B7DD8] border-[#BFD9F5]',
  '好思考的儿童':                                            'bg-[#FFF8EC] text-[#B8860B] border-[#F0DCA0]',
  '身体健康的儿童':                                          'bg-[#FFE8EE] text-[#C94060] border-[#F0B5C5]',
  '通过艺术创意表达，并享受艺术':                            'bg-[#FDF0FF] text-[#9A3DC8] border-[#E4BFF5]',
  '与时俱进的儿童':                                          'bg-[#FFF3EC] text-[#D06830] border-[#F5D0B5]',
};

function rebuildRaw(
  context: string,
  observation: string,
  analysis: LearningAnalysisItem[],
  language: ParsedReport['language'],
): string {
  const labels = REPORT_SECTION_LABELS[language];
  let raw = '';
  if (context) raw += `${labels.context}:\n${context}\n\n`;
  if (observation) raw += `${labels.observation}:\n${observation}\n\n`;
  if (analysis.length > 0) {
    raw += `${labels.analysis}:\n\n`;
    for (const item of analysis) {
      raw += `${item.category}: ${item.description}\n\n`;
    }
  }
  return raw.trim();
}

// Small edit button cluster
function EditButtons({ editing, onSave, onEdit, onCancel }: { editing: boolean; onSave: () => void; onEdit: () => void; onCancel: () => void }) {
  if (editing) {
    return (
      <div className="flex gap-1">
        <button onClick={onSave} className="p-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors" title="Save"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={onCancel} className="p-1.5 rounded-lg bg-destructive/8 hover:bg-destructive/15 text-destructive/70 transition-colors" title="Cancel"><X className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  return (
    <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="Edit">
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}

export function ObservationReport({ report, isStreaming, childName, taggedChildren, imagePreview, imageFile, onReportEdit, isTestMode }: ObservationReportProps) {
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContext, setEditContext] = useState(report.context);
  const [editObservation, setEditObservation] = useState(report.observation);
  const [editAnalysis, setEditAnalysis] = useState<LearningAnalysisItem[]>(report.learningAnalysis);

  useEffect(() => {
    setEditContext(report.context);
    setEditObservation(report.observation);
    setEditAnalysis(report.learningAnalysis);
  }, [report]);

  const saveEdit = () => {
    setEditingSection(null);
    if (!onReportEdit) return;
    const updated: ParsedReport = {
      ...report,
      context: editContext,
      observation: editObservation,
      learningAnalysis: editAnalysis,
      raw: rebuildRaw(editContext, editObservation, editAnalysis, report.language),
    };
    onReportEdit(updated);
  };

  const cancelEdit = () => {
    setEditContext(report.context);
    setEditObservation(report.observation);
    setEditAnalysis(report.learningAnalysis);
    setEditingSection(null);
  };

  const updateAnalysisItem = (index: number, description: string) => {
    setEditAnalysis(prev => prev.map((item, i) => i === index ? { ...item, description } : item));
  };

  const handleCopy = async () => {
    const rawText = rebuildRaw(editContext, editObservation, editAnalysis, report.language);
    await navigator.clipboard.writeText(rawText);
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
        title: report.language === 'ZH'
          ? `学习时刻 : ${report.context || '课堂观察'}`
          : `Moments : ${report.context || 'Classroom Observation'}`,
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
  const sectionLabels = report.language === 'ZH'
    ? {
        context: '情境',
        observation: '观察记录',
        analysis: '学习分析',
        writingAnalysis: '正在撰写学习分析...',
      }
    : {
        context: 'Context',
        observation: 'Observation',
        analysis: 'Learning Analysis',
        writingAnalysis: 'Writing analysis...',
      };

  const primaryChild = taggedChildren?.[0];
  const displayTitle = report.context
    ? report.context.length > 60 ? report.context.slice(0, 60) + '...' : report.context
    : report.language === 'ZH' ? '课堂观察记录' : 'Classroom Observation';

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="space-y-0">
      {/* ── Report Title Banner ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-6 py-5 bg-gradient-to-r from-[hsl(38,50%,97%)] to-primary/5 border-b border-border/40"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary/70 mb-1">
          {report.language === 'ZH' ? '学习时刻' : 'Moments'}
        </p>
        <h2 className="text-lg font-extrabold text-foreground font-display leading-snug">{displayTitle}</h2>
        <div className="flex items-center gap-4 mt-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
            <Calendar className="w-3 h-3" /> {dateStr}
          </span>
          {primaryChild && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
              <User className="w-3 h-3" /> {primaryChild.name}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Student Info ────────────────────────────────────────── */}
      {primaryChild && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="px-6 py-3.5 border-b border-border/40"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-sage">{primaryChild.class_group || 'Class'}</span>
            <span className="badge-coral">{primaryChild.name}</span>
            {taggedChildren && taggedChildren.length > 1 && (
              taggedChildren.slice(1).map((child) => (
                <span key={child.id} className="badge-pastel bg-secondary text-muted-foreground">
                  {child.name}
                </span>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* ── Photo ───────────────────────────────────────────────── */}
      {imagePreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="relative flex items-center justify-center bg-[hsl(38,40%,96%)] border-b border-border/40 overflow-hidden"
        >
          <img
            src={imagePreview}
            alt="Classroom observation"
            className="max-h-[320px] w-auto object-contain rounded-sm"
          />
        </motion.div>
      )}

      {/* ── Context Section ─────────────────────────────────────── */}
      {hasContext && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mx-5 mt-5"
        >
          <div className="report-section bg-[hsl(38,50%,97%)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-primary/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                {sectionLabels.context}
              </h3>
              {isDone && (
                <EditButtons
                  editing={editingSection === 'context'}
                  onSave={saveEdit}
                  onEdit={() => setEditingSection('context')}
                  onCancel={cancelEdit}
                />
              )}
            </div>
            {editingSection === 'context' ? (
              <textarea
                value={editContext}
                onChange={(e) => setEditContext(e.target.value)}
                className="w-full text-sm leading-relaxed text-foreground bg-white/80 border border-border/60 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
              />
            ) : (
              <p className="text-sm leading-relaxed text-foreground/85">
                {editContext}
                {isStreaming && !hasObservation && <StreamingCursor />}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Observation Section ─────────────────────────────────── */}
      {hasObservation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="mx-5 mt-2"
        >
          <div className="report-section">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/40" />
                {sectionLabels.observation}
              </h3>
              {isDone && (
                <EditButtons
                  editing={editingSection === 'observation'}
                  onSave={saveEdit}
                  onEdit={() => setEditingSection('observation')}
                  onCancel={cancelEdit}
                />
              )}
            </div>
            {editingSection === 'observation' ? (
              <textarea
                value={editObservation}
                onChange={(e) => setEditObservation(e.target.value)}
                className="w-full text-sm leading-7 text-foreground bg-white/80 border border-border/60 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={8}
              />
            ) : (
              <p className="text-[13px] leading-7 text-foreground/85 whitespace-pre-line">
                {editObservation}
                {isStreaming && !hasAnalysis && <StreamingCursor />}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Learning Analysis ───────────────────────────────────── */}
      {hasAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mx-5 mt-2 mb-4"
        >
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground mb-3 flex items-center gap-1.5 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            {sectionLabels.analysis}
          </h3>
          <div className="space-y-2.5">
            {editAnalysis.map((item, i) => {
              const colors = CATEGORY_COLORS[item.category] || { bg: '#F5F5F5', border: '#DDD', dot: '#999' };
              const badgeStyle = BADGE_STYLES[item.category] || 'bg-secondary text-foreground border-border';
              const isEditingThis = editingSection === `analysis-${i}`;
              return (
                <motion.div
                  key={item.category}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.2 + i * 0.04 }}
                  className="rounded-2xl border p-4 transition-shadow hover:shadow-sm"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border + '60' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeStyle}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.dot }} />
                      {item.category}
                    </span>
                    {isDone && !isStreaming && (
                      <EditButtons
                        editing={isEditingThis}
                        onSave={saveEdit}
                        onEdit={() => setEditingSection(`analysis-${i}`)}
                        onCancel={cancelEdit}
                      />
                    )}
                  </div>
                  {isEditingThis ? (
                    <textarea
                      value={editAnalysis[i].description}
                      onChange={(e) => updateAnalysisItem(i, e.target.value)}
                      className="w-full text-[13px] text-foreground/80 leading-relaxed bg-white/70 border border-border/40 rounded-xl p-2.5 mt-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                      rows={3}
                    />
                  ) : (
                    <p className="text-[13px] text-foreground/75 leading-relaxed mt-2">{item.description}</p>
                  )}
                </motion.div>
              );
            })}

            {isStreaming && (
              <div className="flex items-center gap-2 pt-1 px-1">
                <StreamingCursor />
                <span className="text-xs text-muted-foreground font-medium">{sectionLabels.writingAnalysis}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Fallback for unstructured provider output */}
      {!hasAnySections && report.raw.trim().length > 0 && (
        <div className="px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2">
            Raw Report Output
          </p>
          <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">
            {report.raw}
            {isStreaming && <StreamingCursor />}
          </p>
        </div>
      )}

      {/* ── Footer Actions ──────────────────────────────────────── */}
      {isDone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="px-6 py-4 flex items-center justify-between border-t border-border/30 bg-gradient-to-r from-white/60 to-secondary/40"
        >
          <span className="text-[11px] text-muted-foreground font-medium">
            {dateStr}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-border/60 bg-white hover:border-primary/30 hover:text-primary transition-all shadow-sm"
            >
              {copied ? (
                <><Check className="w-3 h-3" /> Copied</>
              ) : (
                <><Copy className="w-3 h-3" /> Copy</>
              )}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || published || isTestMode}
              title={isTestMode ? 'Disabled in test mode' : undefined}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-sm ${
                published
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : isTestMode
                    ? 'bg-muted/60 text-muted-foreground border border-border/50'
                    : 'btn-primary'
              } disabled:opacity-60`}
            >
              {publishing ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Publishing...</>
              ) : published ? (
                <><Check className="w-3 h-3" /> Published</>
              ) : isTestMode ? (
                <><Send className="w-3 h-3" /> Publish (test)</>
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
