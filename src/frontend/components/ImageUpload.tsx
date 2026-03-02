import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, Image as ImageIcon, Camera } from "lucide-react";

interface ImageUploadProps {
  onImageSelect: (file: File, preview: string) => void;
  selectedImage: string | null;
  onClear: () => void;
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
        className={`upload-zone group flex flex-col items-center justify-center h-full min-h-[280px] cursor-pointer ${
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
          className="flex flex-col items-center gap-4 p-6"
          animate={{ y: isDragOver ? -4 : 0, scale: isDragOver ? 1.02 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {/* Icon with playful styling */}
          <div className={`relative transition-all duration-300 ${
            isDragOver ? "scale-110" : "group-hover:scale-105"
          }`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isDragOver 
                ? "bg-primary/20 shadow-lg" 
                : "bg-gradient-to-br from-primary/10 to-accent/10 group-hover:from-primary/20 group-hover:to-accent/20"
            }`}>
              <Camera className={`w-7 h-7 transition-colors duration-300 ${
                isDragOver ? "text-primary" : "text-primary/70 group-hover:text-primary"
              }`} />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-md">
              <Upload className="w-3 h-3 text-white" />
            </div>
          </div>
          
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-foreground">
              {isDragOver ? "Drop your photo here!" : "Upload a photo"}
            </p>
            <p className="text-sm text-muted-foreground">
              Drag and drop or click to browse
            </p>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-secondary/60 rounded-full border border-border/40">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">PNG, JPG, GIF supported</span>
          </div>
        </motion.div>
      </label>
    </motion.div>
  );
}