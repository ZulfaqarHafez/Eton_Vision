import { motion } from "framer-motion";
import { Camera, Rss, Users, Settings, Sparkles } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface HeaderProps {
  onSettingsOpen?: () => void;
}

const NAV_ITEMS = [
  { to: "/", label: "Observe", icon: Camera },
  { to: "/feed", label: "Feed", icon: Rss },
  { to: "/?tab=students", label: "Students", icon: Users },
];

// Inline SVG logo — a small stylised eye with a sparkle
function LogoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="13" fill="url(#logo-grad)" />
      <ellipse cx="14" cy="15" rx="7" ry="5" fill="white" fillOpacity="0.92" />
      <circle cx="14" cy="15" r="3" fill="#E8845A" />
      <circle cx="14" cy="15" r="1.3" fill="#2D2D2D" />
      <circle cx="15.2" cy="13.8" r="0.7" fill="white" />
      <path d="M19 8l1.2-2.5L22.5 4.3l-2.3 1.2L19 8z" fill="#FFD86B" />
      <defs>
        <linearGradient id="logo-grad" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8845A" />
          <stop offset="1" stopColor="#5CB88A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

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
        className="fixed top-0 left-0 right-0 z-50 bg-[hsl(38,50%,97%,0.92)] backdrop-blur-md border-b border-border/60"
        style={{ boxShadow: "0 1px 12px hsl(25 30% 18% / 0.04)" }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <LogoIcon />
            <div className="flex items-baseline gap-0.5">
              <span className="text-xl font-extrabold tracking-tight font-display text-foreground">
                Eton
              </span>
              <span className="text-xl font-extrabold tracking-tight font-display text-primary">
                Vision
              </span>
              <Sparkles className="w-3 h-3 text-[hsl(42,95%,65%)] ml-0.5 opacity-70 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 bg-white/60 rounded-full p-1 border border-border/40">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`
                    flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all duration-200
                    ${active
                      ? "bg-white text-primary shadow-sm border border-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/70"
                    }
                  `}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Settings */}
          {onSettingsOpen && (
            <button
              onClick={onSettingsOpen}
              className="p-2.5 rounded-full bg-white/80 hover:bg-white border border-border/50 shadow-sm transition-all hover:shadow-md"
              title="Settings"
            >
              <Settings className="w-[18px] h-[18px] text-muted-foreground" />
            </button>
          )}
          {!onSettingsOpen && <div className="w-10" />}
        </div>
      </motion.header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[hsl(40,40%,99%,0.95)] backdrop-blur-md border-t border-border/60 safe-area-bottom">
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
                <item.icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className={`text-[11px] ${active ? "font-extrabold" : "font-semibold"}`}>
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
              <Settings className="w-5 h-5" />
              <span className="text-[11px] font-semibold">Settings</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
