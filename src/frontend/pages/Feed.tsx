import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, FileText, Calendar, User, Trash2 } from "lucide-react";
import { fetchPublishedReports, deletePublishedReport, type PublishedReport } from "@/frontend/lib/supabase";
import { CATEGORY_COLORS } from "../lib/parseReport";
import { Header } from "@/frontend/components/Header";

function isMandarinReport(report: PublishedReport): boolean {
  const hasZhCategory = report.learning_analysis?.some((item) => /[\u4e00-\u9fff]/.test(item.category));
  if (hasZhCategory) return true;

  const combined = `${report.context || ''}\n${report.observation || ''}`;
  const cjkCount = combined.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return cjkCount >= 12;
}

export default function Feed() {
  const [reports, setReports] = useState<PublishedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      await deletePublishedReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  useEffect(() => {
    async function load() {
      const data = await fetchPublishedReports();
      setReports(data);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-16 pb-20 md:pb-6">
        {/* Page Title */}
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-5 pb-2">
          <h1 className="text-xl font-bold text-foreground">Published Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse observation stories shared by your team.
          </p>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-6 space-y-4 mt-2">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading published reports...</p>
            </div>
          )}

          {!loading && reports.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/70 border border-border/60 flex items-center justify-center">
                <FileText className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-lg font-semibold text-foreground/50">No published reports yet</p>
              <p className="text-sm text-muted-foreground max-w-[300px]">
                Generate a report and click "Publish" to see it here.
              </p>
            </div>
          )}

          {reports.map((report, index) => {
            const isExpanded = expandedId === report.id;
            const mandarin = isMandarinReport(report);
            const labels = mandarin
              ? { context: '情境', observation: '观察记录', analysis: '学习分析' }
              : { context: 'Context', observation: 'Observation', analysis: 'Learning Analysis' };

            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="rounded-2xl border border-border/80 bg-card/90 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    className="w-full text-left px-5 py-4 pr-16 hover:bg-secondary/35 transition-colors min-h-[72px]"
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail — larger for easier recognition */}
                      {report.image_url && (
                        <img
                          src={report.image_url}
                          alt=""
                          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-foreground truncate">{report.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <User className="w-4 h-4" />
                            {report.student_name}
                          </span>
                          {report.class_group && (
                            <span className="px-2 py-0.5 rounded-lg bg-secondary/70 text-foreground/80 border border-border/60 text-xs font-semibold">
                              {report.class_group}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {new Date(report.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        {!isExpanded && report.observation && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {report.observation}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }}
                    className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Expanded View — full Moments template */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-border/70 bg-background/35"
                  >
                    {/* Student info bar */}
                    <div className="px-5 py-3 bg-secondary/35 border-b border-border/70">
                      <div className="text-xs text-muted-foreground mb-1.5">Showing to:</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {report.class_group && (
                          <span className="inline-block px-3 py-1.5 rounded-lg bg-background/80 border border-border/60 text-foreground/80 text-sm font-semibold">
                            {report.class_group}
                          </span>
                        )}
                        <span className="inline-block px-3 py-1.5 rounded-lg bg-background/80 border border-border/60 text-foreground/80 text-sm font-semibold">
                          {report.student_name}
                        </span>
                      </div>
                    </div>

                    {/* Photo */}
                    {report.image_url && (
                      <div className="relative flex items-center justify-center bg-secondary/35 border-b border-border/70">
                        <img
                          src={report.image_url}
                          alt="Observation"
                          className="max-h-[400px] w-auto object-contain"
                        />
                      </div>
                    )}

                    {/* Context */}
                    {report.context && (
                      <div className="px-5 py-4 border-b border-border/70">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{labels.context}:</h4>
                        <p className="text-base leading-relaxed text-foreground">{report.context}</p>
                      </div>
                    )}

                    {/* Observation */}
                    {report.observation && (
                      <div className="px-5 py-4 border-b border-border/70">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{labels.observation}:</h4>
                        <p className="text-base leading-7 text-foreground whitespace-pre-line">{report.observation}</p>
                      </div>
                    )}

                    {/* Learning Analysis */}
                    {report.learning_analysis && report.learning_analysis.length > 0 && (
                      <div className="px-5 py-4">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">{labels.analysis}:</h4>
                        <div className="space-y-3">
                          {report.learning_analysis.map((item) => {
                            const colors = CATEGORY_COLORS[item.category] || { bg: '#F5F5F5', border: '#DDD', dot: '#999' };
                            return (
                              <div key={item.category} className="flex items-start gap-3 p-3 rounded-xl bg-background/75 border border-border/60">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                                  style={{ background: colors.dot }}
                                />
                                <div>
                                  <span className="text-sm font-bold text-foreground">{item.category}:</span>{' '}
                                  <span className="text-sm text-foreground/80 leading-relaxed">{item.description}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
