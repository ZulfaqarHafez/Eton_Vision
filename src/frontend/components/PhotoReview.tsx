import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import * as faceapi from 'face-api.js';
import {
  Loader2, Users, Plus, ScanFace, X, Star, UserPlus,
  CheckCircle2, AlertCircle, ImagePlus,
} from 'lucide-react';
import { Badge } from '@/frontend/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/frontend/components/ui/avatar';
import { Progress } from '@/frontend/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { supabase, matchFace, type Child, type TaggedChild } from '@/frontend/lib/supabase';
import { useFaceDetection } from '@/frontend/hooks/useFaceDetection';
import { getFaceCanvas } from '@/frontend/lib/faceUtils';
import type { UploadedPhoto } from './ImageUpload';

/* ── Types ──────────────────────────────────────────────── */

interface DetectedFaceInfo {
  childId: string | null;
  childName: string | null;
  classGroup: string;
  similarity: number;
  thumbnail: string;
}

export interface ScannedPhoto {
  file: File;
  preview: string;
  faces: DetectedFaceInfo[];
  taggedChildren: TaggedChild[];
}

interface PhotoReviewProps {
  photos: UploadedPhoto[];
  savedScans: ScannedPhoto[];
  onScanComplete: (results: ScannedPhoto[]) => void;
  primaryIndex: number;
  onSetPrimary: (index: number) => void;
  onAddMore: (photos: UploadedPhoto[]) => void;
  onRemovePhoto: (index: number) => void;
  consolidatedTags: TaggedChild[];
  excludedStudentIds: Set<string>;
  onToggleStudent: (childId: string) => void;
  onManualAdd: (child: TaggedChild) => void;
  onClearAll: () => void;
}

/* ── PhotoReview Component ──────────────────────────────── */

export function PhotoReview({
  photos,
  savedScans,
  onScanComplete,
  primaryIndex,
  onSetPrimary,
  onAddMore,
  onRemovePhoto,
  consolidatedTags,
  excludedStudentIds,
  onToggleStudent,
  onManualAdd,
  onClearAll,
}: PhotoReviewProps) {
  const { modelsLoaded } = useFaceDetection();
  const [allChildren, setAllChildren] = useState<Child[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [showAddManual, setShowAddManual] = useState(false);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const scanLockRef = useRef(false);
  const lastScanCountRef = useRef(savedScans.length);

  const includedCount = consolidatedTags.filter(t => !excludedStudentIds.has(t.id)).length;

  // Fetch enrolled children
  useEffect(() => {
    async function fetchChildren() {
      const { data } = await supabase.from('children').select('*').order('name');
      if (data) setAllChildren(data);
    }
    fetchChildren();
  }, []);

  // Scan photos that haven't been scanned yet
  useEffect(() => {
    if (!modelsLoaded || scanning || scanLockRef.current) return;

    // Determine which photos need scanning
    const alreadyScanned = savedScans.length;
    if (alreadyScanned >= photos.length) return;

    // New photos to scan (appended after the already-scanned ones)
    const newPhotos = photos.slice(alreadyScanned);
    if (newPhotos.length === 0) return;

    scanLockRef.current = true;
    scanNewPhotos(newPhotos, savedScans);
  }, [modelsLoaded, photos.length, savedScans.length]);

  const scanNewPhotos = useCallback(async (
    newPhotos: UploadedPhoto[],
    existingScans: ScannedPhoto[],
  ) => {
    setScanning(true);
    setScanTotal(newPhotos.length);
    setScanProgress(0);

    const newResults: ScannedPhoto[] = [];

    for (let i = 0; i < newPhotos.length; i++) {
      const photo = newPhotos[i];
      setScanProgress(i + 1);

      try {
        const img = await faceapi.bufferToImage(photo.file);
        const detections = await faceapi
          .detectAllFaces(img)
          .withFaceLandmarks()
          .withFaceDescriptors();

        const faces: DetectedFaceInfo[] = [];
        const tags: TaggedChild[] = [];
        const usedChildIds = new Set<string>();

        if (detections && detections.length > 0) {
          const sorted = [...detections].sort((a, b) => b.detection.score - a.detection.score);

          for (const det of sorted) {
            const embedding = Array.from(det.descriptor);
            const box = det.detection.box;
            const thumbnail = getFaceCanvas(img, box);
            const match = await matchFace(embedding);

            if (match && !usedChildIds.has(match.child_id)) {
              usedChildIds.add(match.child_id);
              const child = allChildren.find(c => c.id === match.child_id);
              faces.push({
                childId: match.child_id,
                childName: match.name,
                classGroup: child?.class_group || '',
                similarity: match.similarity,
                thumbnail,
              });
              tags.push({
                id: match.child_id,
                name: match.name,
                class_group: child?.class_group || '',
                confidence: match.similarity,
                thumbnail,
              });
            } else if (!match) {
              faces.push({
                childId: null,
                childName: null,
                classGroup: '',
                similarity: 0,
                thumbnail,
              });
            }
          }
        }

        newResults.push({ file: photo.file, preview: photo.preview, faces, taggedChildren: tags });
      } catch (err) {
        console.error('Batch scan error:', err);
        newResults.push({ file: photo.file, preview: photo.preview, faces: [], taggedChildren: [] });
      }
    }

    const allResults = [...existingScans, ...newResults];
    onScanComplete(allResults);
    lastScanCountRef.current = allResults.length;
    setScanning(false);
    scanLockRef.current = false;
  }, [allChildren, onScanComplete]);

  const handleAddMoreFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPhotos: UploadedPhoto[] = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(file => ({ file, preview: URL.createObjectURL(file) }));
    if (newPhotos.length > 0) {
      onAddMore(newPhotos);
    }
    e.target.value = '';
  }, [onAddMore]);

  const handleManualAdd = (childId: string) => {
    if (!childId) return;
    const child = allChildren.find(c => c.id === childId);
    if (!child) return;
    onManualAdd({
      id: child.id,
      name: child.name,
      class_group: child.class_group || '',
      confidence: 1.0,
    });
    setShowAddManual(false);
  };

  const primaryPhoto = savedScans[primaryIndex];
  const availableChildrenForManual = allChildren.filter(
    c => !consolidatedTags.some(t => t.id === c.id)
  );

  return (
    <div className="space-y-4">
      {/* ── Photo Strip ───────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary/60" />
            Photos ({photos.length})
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => addMoreInputRef.current?.click()}
              className="text-xs text-primary hover:underline font-bold py-1 px-2 rounded-lg hover:bg-primary/5 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
            <button
              onClick={onClearAll}
              className="text-xs text-muted-foreground hover:text-destructive hover:underline font-bold py-1 px-2 rounded-lg hover:bg-destructive/5 transition-colors"
            >
              Clear
            </button>
          </div>
          <input
            ref={addMoreInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleAddMoreFiles}
          />
        </div>

        {/* Thumbnails */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {photos.map((photo, idx) => {
            const isPrimary = idx === primaryIndex;
            const scanned = savedScans[idx];
            const matchCount = scanned?.faces.filter(f => f.childId).length ?? 0;
            const isScanned = !!scanned;

            return (
              <motion.button
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => onSetPrimary(idx)}
                className={`relative flex-shrink-0 w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all group ${
                  isPrimary
                    ? 'border-primary shadow-md ring-2 ring-primary/20'
                    : 'border-border/50 hover:border-primary/30'
                }`}
              >
                <img src={photo.preview} alt="" className="w-full h-full object-cover" />

                {/* Primary star */}
                {isPrimary && (
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Star className="w-2.5 h-2.5 text-white fill-white" />
                  </div>
                )}

                {/* Scanning spinner */}
                {!isScanned && scanning && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </div>
                )}

                {/* Match count badge */}
                {isScanned && matchCount > 0 && (
                  <div className="absolute bottom-0.5 right-0.5 bg-green-500/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 backdrop-blur-sm">
                    <Users className="w-2.5 h-2.5" />{matchCount}
                  </div>
                )}

                {/* Scanned check */}
                {isScanned && matchCount === 0 && (
                  <div className="absolute bottom-0.5 right-0.5 bg-white/80 text-muted-foreground text-[8px] font-bold px-1 py-0.5 rounded-full backdrop-blur-sm">
                    <CheckCircle2 className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                )}

                {/* Remove (hover) */}
                {photos.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemovePhoto(idx); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </motion.button>
            );
          })}

          {/* Add more inline button */}
          <button
            onClick={() => addMoreInputRef.current?.click()}
            className="flex-shrink-0 w-[72px] h-[72px] rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 flex flex-col items-center justify-center gap-1 transition-colors text-muted-foreground hover:text-primary"
          >
            <ImagePlus className="w-4 h-4" />
            <span className="text-[8px] font-bold">Add</span>
          </button>
        </div>

        {/* Primary photo preview */}
        {primaryPhoto && (
          <div className="relative rounded-xl overflow-hidden border border-border/40">
            <img
              src={primaryPhoto.preview}
              alt="Primary photo"
              className="w-full max-h-[220px] object-cover"
            />
            {/* Face name overlays */}
            {primaryPhoto.faces.filter(f => f.childId).length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2 pt-6">
                <div className="flex flex-wrap gap-1">
                  {primaryPhoto.faces.filter(f => f.childId).map((face, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-bold text-white bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full"
                    >
                      {face.childName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="absolute top-2 left-2">
              <Badge className="bg-primary/90 text-white text-[9px] font-bold px-2 py-0.5 shadow-sm">
                <Star className="w-2.5 h-2.5 mr-1 fill-white" /> Primary for report
              </Badge>
            </div>
          </div>
        )}

        {/* Scan progress */}
        {scanning && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ScanFace className="w-3.5 h-3.5 text-primary animate-pulse" />
              <span className="text-xs font-bold text-foreground">
                Scanning faces... {scanProgress}/{scanTotal}
              </span>
            </div>
            <Progress value={(scanProgress / scanTotal) * 100} className="h-1" />
          </div>
        )}

        {/* Models loading */}
        {!modelsLoaded && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading face recognition models...
          </div>
        )}
      </div>

      {/* ── Students Found ────────────────────────────────── */}
      {!scanning && consolidatedTags.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500/60" />
              Students Found
            </label>
            <span className="text-[10px] text-muted-foreground font-medium">
              {includedCount} included
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Tap to include or exclude from the report
          </p>

          <div className="flex flex-wrap gap-1.5">
            {consolidatedTags.map(child => {
              const excluded = excludedStudentIds.has(child.id);
              return (
                <button
                  key={child.id}
                  onClick={() => onToggleStudent(child.id)}
                  className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    excluded
                      ? 'bg-secondary/50 text-muted-foreground border-border/40 opacity-60 line-through'
                      : 'bg-green-50 text-green-800 border-green-200 shadow-sm'
                  }`}
                >
                  <Avatar className="w-5 h-5">
                    {child.thumbnail && <AvatarImage src={child.thumbnail} />}
                    <AvatarFallback className="text-[8px]">{child.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span>{child.name}</span>
                  {!excluded && child.confidence < 1.0 && (
                    <span className="text-[9px] text-green-600">
                      {Math.round(child.confidence * 100)}%
                    </span>
                  )}
                  {!excluded ? (
                    <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No faces found */}
      {!scanning && savedScans.length > 0 && savedScans.length >= photos.length && consolidatedTags.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          No enrolled students detected.
        </div>
      )}

      {/* Manual add student */}
      {!scanning && savedScans.length > 0 && (
        <div>
          {showAddManual ? (
            <div className="flex items-center gap-2">
              <Select onValueChange={handleManualAdd}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select a student..." />
                </SelectTrigger>
                <SelectContent>
                  {availableChildrenForManual.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name} — {c.class_group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => setShowAddManual(false)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddManual(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <UserPlus className="w-3 h-3" />
              Add student manually
            </button>
          )}
        </div>
      )}
    </div>
  );
}
