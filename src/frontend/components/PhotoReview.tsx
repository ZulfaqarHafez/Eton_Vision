import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import * as faceapi from 'face-api.js';
import {
  Loader2, Users, Plus, ScanFace, X, Star, UserPlus,
  CheckCircle2, ImagePlus,
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
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────── */

interface DetectedFaceInfo {
  id: string;
  childId: string | null;
  childName: string | null;
  classGroup: string;
  similarity: number;
  thumbnail: string;
  descriptor: number[];
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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
  currentPhotoTags: TaggedChild[];
  photoTagsByIndex: Record<number, TaggedChild[]>;
  excludedStudentIds: Set<string>;
  onToggleStudent: (childId: string) => void;
  onManualAdd: (child: TaggedChild) => void;
  totalUniqueFound: number;
  onClearAll: () => void;
}

function clampToUnit(value: number) {
  return Math.max(0, Math.min(1, value));
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
  currentPhotoTags,
  photoTagsByIndex,
  excludedStudentIds,
  onToggleStudent,
  onManualAdd,
  totalUniqueFound,
  onClearAll,
}: PhotoReviewProps) {
  const { modelsLoaded } = useFaceDetection();
  const [allChildren, setAllChildren] = useState<Child[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [showAddManual, setShowAddManual] = useState(false);
  const [pendingUnknownFaceId, setPendingUnknownFaceId] = useState<string | null>(null);
  const [manualFaceChildId, setManualFaceChildId] = useState('');
  const [savingManualFace, setSavingManualFace] = useState(false);
  const [teacherMode, setTeacherMode] = useState<'focus' | 'overview'>('focus');
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const scanLockRef = useRef(false);
  const lastScanCountRef = useRef(savedScans.length);

  const includedCount = currentPhotoTags.filter(t => !excludedStudentIds.has(t.id)).length;

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
          const imageWidth = img.naturalWidth || img.width;
          const imageHeight = img.naturalHeight || img.height;

          for (let detIdx = 0; detIdx < sorted.length; detIdx++) {
            const det = sorted[detIdx];
            const embedding = Array.from(det.descriptor);
            const box = det.detection.box;
            const thumbnail = getFaceCanvas(img, box);
            const match = await matchFace(embedding);
            const faceId = `${photo.file.name}-${i}-${detIdx}-${Math.round(box.x)}-${Math.round(box.y)}-${Math.round(box.width)}-${Math.round(box.height)}`;
            const normalizedBox = {
              x: clampToUnit(box.x / imageWidth),
              y: clampToUnit(box.y / imageHeight),
              width: clampToUnit(box.width / imageWidth),
              height: clampToUnit(box.height / imageHeight),
            };

            const detectedFaceBase: DetectedFaceInfo = {
              id: faceId,
              childId: null,
              childName: null,
              classGroup: '',
              similarity: 0,
              thumbnail,
              descriptor: embedding,
              box: normalizedBox,
            };

            if (match && !usedChildIds.has(match.child_id)) {
              usedChildIds.add(match.child_id);
              const child = allChildren.find(c => c.id === match.child_id);
              faces.push({
                ...detectedFaceBase,
                childId: match.child_id,
                childName: match.name,
                classGroup: child?.class_group || '',
                similarity: match.similarity,
              });
              tags.push({
                id: match.child_id,
                name: match.name,
                class_group: child?.class_group || '',
                confidence: match.similarity,
                thumbnail,
              });
            } else if (!match) {
              faces.push(detectedFaceBase);
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

  const pendingAssignableFace = primaryPhoto?.faces.find(
    (face) => (!face.childId || excludedStudentIds.has(face.childId)) && face.id === pendingUnknownFaceId,
  );

  const clearPendingFaceSelection = useCallback(() => {
    setPendingUnknownFaceId(null);
    setManualFaceChildId('');
    setSavingManualFace(false);
  }, []);

  const handleUnknownFaceClick = useCallback((faceId: string) => {
    setPendingUnknownFaceId(faceId);
    setManualFaceChildId('');
    setShowAddManual(false);
  }, []);

  const handleAssignManualFace = useCallback(async () => {
    if (!pendingAssignableFace || !manualFaceChildId || !primaryPhoto) return;

    const selectedChild = allChildren.find((child) => child.id === manualFaceChildId);
    if (!selectedChild) return;

    setSavingManualFace(true);
    try {
      const { error } = await supabase.from('face_signatures').insert({
        child_id: selectedChild.id,
        embedding: pendingAssignableFace.descriptor,
        image_url: pendingAssignableFace.thumbnail,
        angle_label: 'AUTO_VERIFIED',
      });

      if (error) throw error;

      const updatedScans = savedScans.map((scan, index) => {
        if (index !== primaryIndex) return scan;

        const updatedFaces = scan.faces.map((face) =>
          face.id === pendingAssignableFace.id
            ? {
                ...face,
                childId: selectedChild.id,
                childName: selectedChild.name,
                classGroup: selectedChild.class_group || '',
                similarity: 1,
              }
            : face,
        );

        const hasTag = scan.taggedChildren.some((tag) => tag.id === selectedChild.id);
        const updatedTags = hasTag
          ? scan.taggedChildren
          : [
              ...scan.taggedChildren,
              {
                id: selectedChild.id,
                name: selectedChild.name,
                class_group: selectedChild.class_group || '',
                confidence: 1,
                thumbnail: pendingAssignableFace.thumbnail,
              },
            ];

        return {
          ...scan,
          faces: updatedFaces,
          taggedChildren: updatedTags,
        };
      });

      onScanComplete(updatedScans);

      if (excludedStudentIds.has(selectedChild.id)) {
        onToggleStudent(selectedChild.id);
      }

      toast.success(`${selectedChild.name} assigned and saved for retraining`);
      clearPendingFaceSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save manual assignment');
      setSavingManualFace(false);
    }
  }, [
    allChildren,
    clearPendingFaceSelection,
    excludedStudentIds,
    manualFaceChildId,
    onScanComplete,
    onToggleStudent,
    pendingAssignableFace,
    primaryIndex,
    primaryPhoto,
    savedScans,
  ]);

  useEffect(() => {
    clearPendingFaceSelection();
  }, [primaryIndex, clearPendingFaceSelection]);

  useEffect(() => {
    clearPendingFaceSelection();
  }, [teacherMode, clearPendingFaceSelection]);

  const availableChildrenForManual = allChildren.filter(
    c => !currentPhotoTags.some(t => t.id === c.id)
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

        {/* Teacher view mode */}
        {!scanning && savedScans.length > 0 && (
          <div className="inline-flex rounded-lg border border-border/60 bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setTeacherMode('focus')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${
                teacherMode === 'focus'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Main Focus
            </button>
            <button
              type="button"
              onClick={() => setTeacherMode('overview')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${
                teacherMode === 'overview'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Context Photos
            </button>
          </div>
        )}

        {!scanning && savedScans.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Reports are generated from the Main Focus photo only. Context photos are reference support.
          </p>
        )}

        {/* Primary photo preview */}
        {teacherMode === 'focus' && primaryPhoto && (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden border border-border/40 bg-black/5">
            <img
              src={primaryPhoto.preview}
              alt="Primary photo"
              className="w-full max-h-[260px] object-contain"
            />
              {primaryPhoto.faces.map((face) => {
                const left = clampToUnit(face.box.x);
                const top = clampToUnit(face.box.y);
                const right = clampToUnit(face.box.x + face.box.width);
                const bottom = clampToUnit(face.box.y + face.box.height);
                const width = Math.max(0.01, right - left);
                const height = Math.max(0.01, bottom - top);
                const isIncluded = !!face.childId && !excludedStudentIds.has(face.childId);
                const selectedForManual = pendingUnknownFaceId === face.id;

                return (
                  <button
                    key={face.id}
                    type="button"
                    disabled={isIncluded}
                    onClick={() => {
                      if (!isIncluded) handleUnknownFaceClick(face.id);
                    }}
                    title={
                      isIncluded
                        ? face.childName || 'Student'
                        : 'Needs review - click to assign'
                    }
                    className={`absolute border-2 rounded-md transition-all ${
                      isIncluded
                        ? 'border-green-500/90 bg-green-500/10'
                        : selectedForManual
                          ? 'border-primary bg-primary/20 ring-2 ring-primary/30'
                          : 'border-red-500/90 bg-red-500/12 hover:bg-red-500/20'
                    }`}
                    style={{
                      left: `${left * 100}%`,
                      top: `${top * 100}%`,
                      width: `${width * 100}%`,
                      height: `${height * 100}%`,
                    }}
                  >
                    <span
                      className={`absolute left-1 top-1 text-[9px] leading-none px-1.5 py-0.5 rounded text-white font-bold ${
                        isIncluded
                          ? 'bg-green-600/90'
                          : selectedForManual
                            ? 'bg-primary'
                            : 'bg-red-600/90'
                      }`}
                    >
                      {isIncluded
                        ? face.childName
                        : 'Needs review'}
                    </span>
                  </button>
                );
              })}

              {primaryPhoto.faces.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground font-medium bg-black/20">
                  No faces detected in this photo
                </div>
              )}

              <div className="absolute top-2 left-2">
                <Badge className="bg-primary/90 text-white text-[9px] font-bold px-2 py-0.5 shadow-sm">
                  <Star className="w-2.5 h-2.5 mr-1 fill-white" /> Main Focus for report
                </Badge>
              </div>
            </div>

            <div className="px-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-green-500/80" /> selected
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-red-500/80" /> needs review
              </span>
            </div>
          </div>
        )}

        {teacherMode === 'focus' && pendingAssignableFace && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Assign selected face to a student and save to training data
            </p>
            <div className="flex items-center gap-2">
              <Select value={manualFaceChildId} onValueChange={setManualFaceChildId}>
                <SelectTrigger className="h-8 text-xs flex-1 bg-white">
                  <SelectValue placeholder="Select student for this face" />
                </SelectTrigger>
                <SelectContent>
                  {allChildren.map((child) => (
                    <SelectItem key={child.id} value={child.id} className="text-xs">
                      {child.name} — {child.class_group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={handleAssignManualFace}
                disabled={!manualFaceChildId || savingManualFace}
                className="h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50"
              >
                {savingManualFace ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving
                  </span>
                ) : (
                  'Save Face'
                )}
              </button>
              <button
                type="button"
                onClick={clearPendingFaceSelection}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
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

        {teacherMode === 'overview' && !scanning && savedScans.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">
              Context photos for reference. Tap a card to make it the Main Focus photo.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {photos.map((photo, idx) => {
                const isPrimary = idx === primaryIndex;
                const tags = photoTagsByIndex[idx] ?? [];

                return (
                  <button
                    key={`overview-${idx}`}
                    type="button"
                    onClick={() => {
                      onSetPrimary(idx);
                      setTeacherMode('focus');
                    }}
                    className={`text-left rounded-xl border overflow-hidden transition-colors ${
                      isPrimary
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border/60 hover:border-primary/30'
                    }`}
                  >
                    <div className="relative">
                      <img src={photo.preview} alt="" className="w-full h-24 object-cover" />
                      {isPrimary && (
                        <span className="absolute top-1 left-1 text-[9px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                          Main Focus
                        </span>
                      )}
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-foreground">Photo {idx + 1}</span>
                        <span className="text-muted-foreground">{tags.length} tagged</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tags.length === 0 && (
                          <span className="text-[10px] text-muted-foreground">No students tagged</span>
                        )}
                        {tags.slice(0, 4).map((tag) => {
                          return (
                            <span
                              key={`overview-${idx}-${tag.id}`}
                              className="text-[9px] px-1.5 py-0.5 rounded-full border bg-green-50 text-green-800 border-green-200"
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                        {tags.length > 4 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            +{tags.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Students Found ────────────────────────────────── */}
      {teacherMode === 'focus' && !scanning && savedScans.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-medium">Main Focus: {includedCount} student{includedCount !== 1 ? 's' : ''} selected</span>
          <span className="font-medium">All photos: {totalUniqueFound} unique seen</span>
        </div>
      )}

      {teacherMode === 'focus' && !scanning && currentPhotoTags.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500/60" />
              Students In Main Focus Photo
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Tap names to include or remove from this report.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {currentPhotoTags.map(child => {
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No faces found */}
      {teacherMode === 'focus' && !scanning && primaryPhoto && currentPhotoTags.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          No students currently selected for this photo.
        </div>
      )}

      {/* Manual add student */}
      {teacherMode === 'focus' && !scanning && savedScans.length > 0 && (
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
              Add student manually (without a face box)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
