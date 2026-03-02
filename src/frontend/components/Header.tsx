import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border"
      style={{ boxShadow: 'var(--shadow-soft)' }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            Eton<span className="text-primary">Report</span>
          </span>
        </div>
      </div>
    </motion.header>
  );
}