import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, Image as ImageIcon, Camera, Sparkles } from "lucide-react";

interface ImageUploadProps {
  onImageSelect: (file: File, preview: string) => void;
  selectedImage: string | null;
  onClear: () => void;
}

/* Cute camera illustration for the upload zone */
function UploadIllustration({ active }: { active?: boolean }) {
  return (
    <svg width="80" height="72" viewBox="0 0 80 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Camera body */}
      <rect x="12" y="22" width="56" height="38" rx="8" fill={active ? "hsl(12,76%,61%)" : "hsl(38,50%,92%)"} stroke={active ? "hsl(12,76%,50%)" : "hsl(35,25%,80%)"} strokeWidth="1.5"/>
      {/* Lens */}
      <circle cx="40" cy="41" r="12" fill="white" stroke={active ? "hsl(12,76%,50%)" : "hsl(35,25%,80%)"} strokeWidth="1.5"/>
      <circle cx="40" cy="41" r="7" fill={active ? "hsl(12,76%,61%,0.2)" : "hsl(38,50%,95%)"}/>
      <circle cx="40" cy="41" r="3.5" fill={active ? "hsl(12,76%,61%,0.4)" : "hsl(35,25%,85%)"}/>
      {/* Flash */}
      <rect x="30" y="16" width="20" height="8" rx="3" fill={active ? "hsl(12,76%,61%)" : "hsl(38,50%,92%)"} stroke={active ? "hsl(12,76%,50%)" : "hsl(35,25%,80%)"} strokeWidth="1.5"/>
      {/* Sparkle decorations */}
      <path d="M66 14l1.5-3 3-1.5-3-1.5L66 5l-1.5 3-3 1.5 3 1.5z" fill="hsl(42,95%,65%)" opacity="0.7"/>
      <circle cx="16" cy="18" r="2" fill="hsl(152,40%,49%)" opacity="0.4"/>
      <circle cx="70" cy="50" r="1.5" fill="hsl(200,80%,65%)" opacity="0.35"/>
    </svg>
  );
}

export function ImageUpload({ onImageSelect, selectedImage, onClear }: ImageUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const preview = URL.createObjectURL(file);
      onImageSelect(file, preview);
    }
  }, [onImageSelect]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const preview = URL.createObjectURL(file);
      onImageSelect(file, preview);
    }
  }, [onImageSelect]);

  if (selectedImage) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <label
        className={`upload-zone group flex flex-col items-center justify-center h-full min-h-[240px] cursor-pointer ${
          isDragOver ? "drag-over" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        
        <motion.div
          className="flex flex-col items-center gap-3 p-6"
          animate={{ y: isDragOver ? -4 : 0, scale: isDragOver ? 1.02 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <UploadIllustration active={isDragOver} />
          
          <div className="text-center space-y-1">
            <p className="text-lg font-extrabold text-foreground font-display">
              {isDragOver ? "Drop it here!" : "Snap & Upload"}
            </p>
            <p className="text-sm text-muted-foreground font-medium">
              Drag and drop or click to browse
            </p>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-white/70 rounded-full border border-border/40">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground font-bold">PNG, JPG, GIF</span>
          </div>
        </motion.div>
      </label>
    </motion.div>
  );
}