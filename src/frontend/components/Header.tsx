import { motion } from "framer-motion";
import { BookOpen, Camera, Rss, Users, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface HeaderProps {
  onSettingsOpen?: () => void;
}

const NAV_ITEMS = [
  { to: "/", label: "Observe", icon: Camera },
  { to: "/feed", label: "Feed", icon: Rss },
  { to: "/?tab=students", label: "Students", icon: Users },
];

export function Header({ onSettingsOpen }: HeaderProps) {
  const location = useLocation();

  const isActive = (item: typeof NAV_ITEMS[number]) => {
    if (item.to === "/?tab=students") {
      return location.pathname === "/" && location.search === "?tab=students";
    }
    if (item.to === "/") {
      return location.pathname === "/" && location.search !== "?tab=students";
    }
    return location.pathname === item.to;
  };

  return (
    <>
      {/* Desktop Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <BookOpen className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Eton<span className="text-primary">Vision</span>
            </span>
          </Link>

          {/* Desktop Nav — pill tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-secondary/60 rounded-2xl p-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                    ${active
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    }
                  `}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Settings button */}
          {onSettingsOpen && (
            <button
              onClick={onSettingsOpen}
              className="p-3 rounded-xl bg-secondary/80 hover:bg-secondary border border-border shadow-sm transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
          {!onSettingsOpen && <div className="w-11" />}
        </div>
      </motion.header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-sm border-t border-border safe-area-bottom">
        <div className="flex items-stretch justify-around h-16">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`
                  flex flex-col items-center justify-center flex-1 gap-0.5 py-2 transition-colors min-w-[64px]
                  ${active ? "text-primary" : "text-muted-foreground"}
                `}
              >
                <item.icon className={`w-6 h-6 ${active ? "stroke-[2.5]" : ""}`} />
                <span className={`text-[11px] ${active ? "font-bold" : "font-medium"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {onSettingsOpen && (
            <button
              onClick={onSettingsOpen}
              className="flex flex-col items-center justify-center flex-1 gap-0.5 py-2 text-muted-foreground min-w-[64px]"
            >
              <Settings className="w-6 h-6" />
              <span className="text-[11px] font-medium">Settings</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
