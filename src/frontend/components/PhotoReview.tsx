import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import * as faceapi from 'face-api.js';
import {
  Loader2, Users, Plus, ScanFace, X, Star, UserPlus,
  CheckCircle2, ImagePlus, SquareDashed, Save, Maximize2, Trash2,
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import {
  supabase,
  matchFaceCandidates,
  type Child,
  type TaggedChild,
  type FaceCandidate,
} from '@/frontend/lib/supabase';
import { useFaceDetection } from '@/frontend/hooks/useFaceDetection';
import { getFaceCanvas } from '@/frontend/lib/faceUtils';
import type { UploadedPhoto } from './ImageUpload';
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────── */

/**
 * A single detected (or manually drawn) face on a photo.
 *
 * - `descriptor`: 128-dim face-api embedding. For manually drawn boxes this is a
 *   **blank** descriptor (all zeros). Blank descriptors are never sent to
 *   face_signatures on Save — they would poison the vector index.
 * - `isManuallyAdded`: true for boxes the teacher drew via "Add box". Excluded
 *   from face_signatures inserts regardless of `needsSave`.
 * - `needsSave`: true when this face still needs to be written to
 *   face_signatures on the next batch Save. Auto-matched faces ship with
 *   `needsSave: true` so Save enriches the vector list (mirrors the prior
 *   per-face AUTO_VERIFIED insert). Flipped to false after a successful batch
 *   insert.
 * - `candidates`: top-5 nearest children at similarity >= 0.70, or [] when the
 *   descriptor is blank or no matches were found.
 */
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
  candidates: FaceCandidate[];
  needsSave: boolean;
  isManuallyAdded: boolean;
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

function buildDetectedFaceId(
  fileName: string,
  photoIndex: number,
  detectionIndex: number,
  box: { x: number; y: number; width: number; height: number },
): string {
  return `${fileName}-${photoIndex}-${detectionIndex}-${Math.round(box.x)}-${Math.round(box.y)}-${Math.round(box.width)}-${Math.round(box.height)}`;
}

function isBlankDescriptor(descriptor: number[]): boolean {
  return descriptor.every((v) => v === 0);
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
  const { modelsLoaded, getAllDetections } = useFaceDetection();

  const [allChildren, setAllChildren] = useState<Child[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [showAddManual, setShowAddManual] = useState(false);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [teacherMode, setTeacherMode] = useState<'focus' | 'overview'>('focus');
  const [savingAll, setSavingAll] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const primaryImgRef = useRef<HTMLImageElement>(null);
  const modalImgRef = useRef<HTMLImageElement>(null);
  const scanLockRef = useRef(false);

  const includedCount = currentPhotoTags.filter(t => !excludedStudentIds.has(t.id)).length;

  useEffect(() => {
    async function fetchChildren() {
      const { data } = await supabase.from('children').select('*').order('name');
      if (data) setAllChildren(data);
    }
    fetchChildren();
  }, []);

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
        const detections = await getAllDetections(img);

        const faces: DetectedFaceInfo[] = [];
        const tags: TaggedChild[] = [];
        const usedChildIds = new Set<string>();

        if (detections && detections.length > 0) {
          const imageWidth = img.naturalWidth || img.width;
          const imageHeight = img.naturalHeight || img.height;

          for (let detIdx = 0; detIdx < detections.length; detIdx++) {
            const det = detections[detIdx];

            const embedding = Array.from(det.descriptor);
            const box = det.detection.box;

            const thumbnail = getFaceCanvas(img, box);

            // Blank-descriptor firewall: don't ask the RPC to match a zero vector.
            const candidates = isBlankDescriptor(embedding)
              ? []
              : await matchFaceCandidates(embedding);

            const faceId = buildDetectedFaceId(photo.file.name, i, detIdx, box);

            const normalizedBox = {
              x: clampToUnit(box.x / imageWidth),
              y: clampToUnit(box.y / imageHeight),
              width: clampToUnit(box.width / imageWidth),
              height: clampToUnit(box.height / imageHeight),
            };

            const top = candidates[0];
            const autoMatched =
              !!top && top.similarity >= 0.95 && !usedChildIds.has(top.child_id);

            const detectedFaceBase: DetectedFaceInfo = {
              id: faceId,
              childId: null,
              childName: null,
              classGroup: '',
              similarity: 0,
              thumbnail,
              descriptor: embedding,
              box: normalizedBox,
              candidates,
              needsSave: true,
              isManuallyAdded: false,
            };

            if (autoMatched) {
              usedChildIds.add(top.child_id);
              const child = allChildren.find(c => c.id === top.child_id);
              const classGroup = child?.class_group || '';
              faces.push({
                ...detectedFaceBase,
                childId: top.child_id,
                childName: top.name,
                classGroup,
                similarity: top.similarity,
              });
              tags.push({
                id: top.child_id,
                name: top.name,
                class_group: classGroup,
                confidence: top.similarity,
                thumbnail,
              });
            } else {
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
    setScanning(false);
    scanLockRef.current = false;
  }, [allChildren, onScanComplete, getAllDetections]);

  useEffect(() => {
    if (!modelsLoaded || scanning || scanLockRef.current) return;

    const alreadyScanned = savedScans.length;
    if (alreadyScanned >= photos.length) return;

    const newPhotos = photos.slice(alreadyScanned);
    if (newPhotos.length === 0) return;

    scanLockRef.current = true;
    scanNewPhotos(newPhotos, savedScans);
  }, [modelsLoaded, photos, savedScans, scanNewPhotos, scanning]);

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
  const selectedFace = primaryPhoto?.faces.find((f) => f.id === selectedFaceId) ?? null;

  /**
   * Reassign a face to a child in local state only. Flips `needsSave = true`
   * so the next batch Save will insert a face_signatures row. Does NOT touch
   * the database — that's what handleSaveAll is for. Passing `candidate: null`
   * clears the assignment on that face.
   */
  const handleAssignFace = useCallback((faceId: string, candidate: FaceCandidate | null) => {
    if (!primaryPhoto) return;

    const updatedScans = savedScans.map((scan, index) => {
      if (index !== primaryIndex) return scan;

      const targetFace = scan.faces.find((f) => f.id === faceId);
      if (!targetFace) return scan;

      const previousChildId = targetFace.childId;

      let nextChildId: string | null = null;
      let nextChildName: string | null = null;
      let nextClassGroup = '';
      let nextSimilarity = 0;

      if (candidate) {
        const child = allChildren.find((c) => c.id === candidate.child_id);
        nextChildId = candidate.child_id;
        nextChildName = candidate.name;
        nextClassGroup = child?.class_group || '';
        nextSimilarity = candidate.similarity;
      }

      const updatedFaces = scan.faces.map((face) =>
        face.id === faceId
          ? {
              ...face,
              childId: nextChildId,
              childName: nextChildName,
              classGroup: nextClassGroup,
              similarity: nextSimilarity,
              needsSave: true,
            }
          : face,
      );

      // Sync taggedChildren: drop the previous assignment if no other face still
      // uses it, and add/swap in the new assignment.
      let updatedTags = scan.taggedChildren;
      if (previousChildId && previousChildId !== nextChildId) {
        const stillUsed = updatedFaces.some(
          (f) => f.id !== faceId && f.childId === previousChildId,
        );
        if (!stillUsed) {
          updatedTags = updatedTags.filter((t) => t.id !== previousChildId);
        }
      }
      if (nextChildId && !updatedTags.some((t) => t.id === nextChildId)) {
        updatedTags = [
          ...updatedTags,
          {
            id: nextChildId,
            name: nextChildName!,
            class_group: nextClassGroup,
            confidence: nextSimilarity,
            thumbnail: targetFace.thumbnail,
          },
        ];
      }

      return { ...scan, faces: updatedFaces, taggedChildren: updatedTags };
    });

    onScanComplete(updatedScans);

    if (candidate && excludedStudentIds.has(candidate.child_id)) {
      onToggleStudent(candidate.child_id);
    }
  }, [
    allChildren,
    excludedStudentIds,
    onScanComplete,
    onToggleStudent,
    primaryIndex,
    primaryPhoto,
    savedScans,
  ]);

  // Every face the teacher has assigned and hasn't yet saved. Drives the
  // Save button's count so it matches the tagged-students count visibly.
  // Drawn/blank-descriptor faces are kept in the count but filtered out at
  // insert time (see handleSaveAll) — a zero-vector embedding would poison
  // the face_signatures similarity index.
  const pendingSaveFaces = useMemo(() => {
    if (!primaryPhoto) return [] as DetectedFaceInfo[];
    return primaryPhoto.faces.filter((f) => f.needsSave && !!f.childId);
  }, [primaryPhoto]);

  /**
   * Batch-insert every pending face on the primary photo into face_signatures.
   * Counted: face.needsSave && childId != null (this is pendingSaveFaces).
   * Actually inserted: the subset with a real descriptor and not a manually
   * drawn box — blank embeddings would corrupt future similarity matches.
   * On success, flips needsSave=false on ALL pendingSaveFaces so the Save
   * count clears even for assignments that couldn't be persisted.
   */
  const handleSaveAll = useCallback(async () => {
    if (!primaryPhoto || pendingSaveFaces.length === 0) return;

    const insertable = pendingSaveFaces.filter(
      (f) => !f.isManuallyAdded && !isBlankDescriptor(f.descriptor),
    );
    const skipped = pendingSaveFaces.length - insertable.length;

    console.log(
      'Saving', insertable.length, 'face_signatures:',
      insertable.map((f) => f.childId),
      skipped > 0 ? `(skipped ${skipped} drawn/blank)` : '',
    );

    setSavingAll(true);
    try {
      if (insertable.length > 0) {
        const rows = insertable.map((f) => ({
          child_id: f.childId as string,
          embedding: f.descriptor,
          image_url: f.thumbnail,
          angle_label: 'AUTO_VERIFIED',
        }));
        const { error } = await supabase.from('face_signatures').insert(rows);
        if (error) throw error;
      }

      const clearedIds = new Set(pendingSaveFaces.map((f) => f.id));
      const updatedScans = savedScans.map((scan, index) => {
        if (index !== primaryIndex) return scan;
        const updatedFaces = scan.faces.map((face) =>
          clearedIds.has(face.id) ? { ...face, needsSave: false } : face,
        );
        return { ...scan, faces: updatedFaces };
      });
      onScanComplete(updatedScans);

      if (insertable.length > 0 && skipped > 0) {
        toast.success(`Saved ${insertable.length} for retraining · ${skipped} drawn box${skipped === 1 ? '' : 'es'} kept as tag only`);
      } else if (insertable.length > 0) {
        toast.success(`Saved ${insertable.length} face${insertable.length === 1 ? '' : 's'} for retraining`);
      } else {
        toast.success(`${skipped} drawn box${skipped === 1 ? '' : 'es'} kept as tag only`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save assignments');
    } finally {
      setSavingAll(false);
    }
  }, [onScanComplete, pendingSaveFaces, primaryIndex, primaryPhoto, savedScans]);

  useEffect(() => {
    setSelectedFaceId(null);
    setDrawMode(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }, [primaryIndex, teacherMode]);

  /*
   * Draw-mode: mousedown records drawStart (normalised 0..1) and seeds
   * drawCurrent; mousemove updates drawCurrent so the preview rect tracks the
   * cursor; mouseup finalises the rect and pushes a new DetectedFaceInfo with
   * a blank descriptor + isManuallyAdded=true. The teacher assigns a child to
   * it via the chip panel's dropdown; on Save, drawn boxes count toward the
   * total but are skipped at insert time (blank embeddings can't enrich the
   * vector index).
   */
  const normalizedPointerForImg = useCallback((e: React.MouseEvent, ref: React.RefObject<HTMLImageElement>) => {
    const imgEl = ref.current;
    if (!imgEl) return null;
    const rect = imgEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clampToUnit((e.clientX - rect.left) / rect.width),
      y: clampToUnit((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const normalizedPointer = useCallback(
    (e: React.MouseEvent) => normalizedPointerForImg(e, primaryImgRef),
    [normalizedPointerForImg],
  );

  const handleDrawMouseDown = useCallback((e: React.MouseEvent) => {
    if (!drawMode) return;
    e.preventDefault();
    const pt = normalizedPointer(e);
    if (!pt) return;
    setDrawStart(pt);
    setDrawCurrent(pt);
  }, [drawMode, normalizedPointer]);

  const handleDrawMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !drawStart) return;
    const pt = normalizedPointer(e);
    if (!pt) return;
    setDrawCurrent(pt);
  }, [drawMode, drawStart, normalizedPointer]);

  const handleModalDrawMouseDown = useCallback((e: React.MouseEvent) => {
    if (!drawMode) return;
    e.preventDefault();
    const pt = normalizedPointerForImg(e, modalImgRef);
    if (!pt) return;
    setDrawStart(pt);
    setDrawCurrent(pt);
  }, [drawMode, normalizedPointerForImg]);

  const handleModalDrawMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !drawStart) return;
    const pt = normalizedPointerForImg(e, modalImgRef);
    if (!pt) return;
    setDrawCurrent(pt);
  }, [drawMode, drawStart, normalizedPointerForImg]);

  const handleDrawMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !drawStart) return;
    const pt = normalizedPointer(e) ?? drawCurrent ?? drawStart;

    const x = Math.min(drawStart.x, pt.x);
    const y = Math.min(drawStart.y, pt.y);
    const width = Math.abs(pt.x - drawStart.x);
    const height = Math.abs(pt.y - drawStart.y);

    setDrawStart(null);
    setDrawCurrent(null);
    setDrawMode(false);

    if (width * height < 0.0005 || !primaryPhoto || !primaryImgRef.current) {
      return;
    }

    const imgEl = primaryImgRef.current;
    const naturalW = imgEl.naturalWidth || imgEl.width;
    const naturalH = imgEl.naturalHeight || imgEl.height;
    const pixelBox = {
      x: x * naturalW,
      y: y * naturalH,
      width: width * naturalW,
      height: height * naturalH,
    };

    let thumbnail = '';
    try {
      thumbnail = getFaceCanvas(imgEl, pixelBox);
    } catch (err) {
      console.warn('Manual thumbnail crop failed:', err);
    }

    const faceId = `manual-${primaryPhoto.file.name}-${Date.now()}-${Math.round(x * 1000)}-${Math.round(y * 1000)}`;

    const newFace: DetectedFaceInfo = {
      id: faceId,
      childId: null,
      childName: null,
      classGroup: '',
      similarity: 0,
      thumbnail,
      descriptor: Array(128).fill(0),
      box: { x, y, width, height },
      candidates: [],
      needsSave: false,
      isManuallyAdded: true,
    };

    const updatedScans = savedScans.map((scan, index) =>
      index === primaryIndex
        ? { ...scan, faces: [...scan.faces, newFace] }
        : scan,
    );
    onScanComplete(updatedScans);
    setSelectedFaceId(faceId);
  }, [drawCurrent, drawMode, drawStart, normalizedPointer, onScanComplete, primaryIndex, primaryPhoto, savedScans]);

  const handleModalDrawMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !drawStart) return;
    const pt = normalizedPointerForImg(e, modalImgRef) ?? drawCurrent ?? drawStart;

    const x = Math.min(drawStart.x, pt.x);
    const y = Math.min(drawStart.y, pt.y);
    const width = Math.abs(pt.x - drawStart.x);
    const height = Math.abs(pt.y - drawStart.y);

    setDrawStart(null);
    setDrawCurrent(null);
    setDrawMode(false);

    if (width * height < 0.0005 || !primaryPhoto || !modalImgRef.current) {
      return;
    }

    const imgEl = modalImgRef.current;
    const naturalW = imgEl.naturalWidth || imgEl.width;
    const naturalH = imgEl.naturalHeight || imgEl.height;
    const pixelBox = {
      x: x * naturalW,
      y: y * naturalH,
      width: width * naturalW,
      height: height * naturalH,
    };

    let thumbnail = '';
    try {
      thumbnail = getFaceCanvas(imgEl, pixelBox);
    } catch (err) {
      console.warn('Manual thumbnail crop failed:', err);
    }

    const faceId = `manual-${primaryPhoto.file.name}-${Date.now()}-${Math.round(x * 1000)}-${Math.round(y * 1000)}`;

    const newFace: DetectedFaceInfo = {
      id: faceId,
      childId: null,
      childName: null,
      classGroup: '',
      similarity: 0,
      thumbnail,
      descriptor: Array(128).fill(0),
      box: { x, y, width, height },
      candidates: [],
      needsSave: false,
      isManuallyAdded: true,
    };

    const updatedScans = savedScans.map((scan, index) =>
      index === primaryIndex
        ? { ...scan, faces: [...scan.faces, newFace] }
        : scan,
    );
    onScanComplete(updatedScans);
    setSelectedFaceId(faceId);
  }, [drawCurrent, drawMode, drawStart, normalizedPointerForImg, onScanComplete, primaryIndex, primaryPhoto, savedScans]);

  const handleRemoveFace = useCallback((faceId: string) => {
    const updatedScans = savedScans.map((scan, index) => {
      if (index !== primaryIndex) return scan;
      const removed = scan.faces.find(f => f.id === faceId);
      const newFaces = scan.faces.filter(f => f.id !== faceId);
      let newTags = scan.taggedChildren;
      if (removed?.childId) {
        const stillUsed = newFaces.some(f => f.childId === removed.childId);
        if (!stillUsed) newTags = newTags.filter(t => t.id !== removed.childId);
      }
      return { ...scan, faces: newFaces, taggedChildren: newTags };
    });
    onScanComplete(updatedScans);
    setSelectedFaceId(null);
  }, [onScanComplete, primaryIndex, savedScans]);

  const availableChildrenForManual = allChildren.filter(
    c => !currentPhotoTags.some(t => t.id === c.id)
  );

  const drawPreview =
    drawMode && drawStart && drawCurrent
      ? {
          left: Math.min(drawStart.x, drawCurrent.x),
          top: Math.min(drawStart.y, drawCurrent.y),
          width: Math.abs(drawCurrent.x - drawStart.x),
          height: Math.abs(drawCurrent.y - drawStart.y),
        }
      : null;

  return (
    <div className="space-y-4">
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

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {photos.map((photo, idx) => {
            const isPrimary = idx === primaryIndex;
            const scanned = savedScans[idx];
            const matchCount = scanned?.faces.filter(f => f.childId).length ?? 0;
            const isScanned = !!scanned;

            return (
              <div key={idx} className="relative flex-shrink-0 group">
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => onSetPrimary(idx)}
                  className={`relative w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all ${
                    isPrimary
                      ? 'border-primary shadow-md ring-2 ring-primary/20'
                      : 'border-border/50 hover:border-primary/30'
                  }`}
                >
                  <img src={photo.preview} alt="" className="w-full h-full object-cover" />

                  {isPrimary && (
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Star className="w-2.5 h-2.5 text-white fill-white" />
                    </div>
                  )}

                  {!isScanned && scanning && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}

                  {isScanned && matchCount > 0 && (
                    <div className="absolute bottom-0.5 right-0.5 bg-green-500/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 backdrop-blur-sm">
                      <Users className="w-2.5 h-2.5" />{matchCount}
                    </div>
                  )}

                  {isScanned && matchCount === 0 && (
                    <div className="absolute bottom-0.5 right-0.5 bg-white/80 text-muted-foreground text-[8px] font-bold px-1 py-0.5 rounded-full backdrop-blur-sm">
                      <CheckCircle2 className="w-3 h-3 text-muted-foreground/50" />
                    </div>
                  )}
                </motion.button>

                {photos.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemovePhoto(idx); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={() => addMoreInputRef.current?.click()}
            className="flex-shrink-0 w-[72px] h-[72px] rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 flex flex-col items-center justify-center gap-1 transition-colors text-muted-foreground hover:text-primary"
          >
            <ImagePlus className="w-4 h-4" />
            <span className="text-[8px] font-bold">Add</span>
          </button>
        </div>

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
          <div className="space-y-2 relative">

            <div className="absolute top-4 left-4 z-10 pointer-events-none">
              <Badge className="bg-primary/90 text-white text-[9px] font-bold px-2 py-0.5 shadow-sm">
                <Star className="w-2.5 h-2.5 mr-1 fill-white" /> Main Focus
              </Badge>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-border/40 bg-black/5 p-2">

              <div
                className={`relative w-full rounded-md overflow-hidden ${
                  drawMode ? 'cursor-crosshair' : ''
                }`}
                onMouseDown={handleDrawMouseDown}
                onMouseMove={handleDrawMouseMove}
                onMouseUp={handleDrawMouseUp}
                onMouseLeave={(e) => {
                  if (drawMode && drawStart) handleDrawMouseUp(e);
                }}
              >
                <img
                  ref={primaryImgRef}
                  src={primaryPhoto.preview}
                  alt="Primary photo"
                  className="w-full h-auto block select-none"
                  draggable={false}
                />

                <button
                  type="button"
                  onClick={() => setIsEnlarged(true)}
                  className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white transition-colors"
                  title="Enlarge photo"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                {primaryPhoto.faces.map((face) => {
                  const left = clampToUnit(face.box.x);
                  const top = clampToUnit(face.box.y);
                  const right = clampToUnit(face.box.x + face.box.width);
                  const bottom = clampToUnit(face.box.y + face.box.height);
                  const width = Math.max(0.01, right - left);
                  const height = Math.max(0.01, bottom - top);
                  const isIncluded = !!face.childId && !excludedStudentIds.has(face.childId);
                  const isSelected = selectedFaceId === face.id;
                  const isManual = face.isManuallyAdded;

                  let borderClass: string;
                  let labelBgClass: string;
                  if (isSelected) {
                    borderClass = 'border-primary bg-primary/20 ring-2 ring-primary/30';
                    labelBgClass = 'bg-primary';
                  } else if (isManual && !face.childId) {
                    borderClass = 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20';
                    labelBgClass = 'bg-amber-600/70';
                  } else if (isIncluded) {
                    borderClass = 'border-green-500/40 bg-green-500/10 hover:bg-green-500/20';
                    labelBgClass = 'bg-green-600/60';
                  } else {
                    borderClass = 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20';
                    labelBgClass = 'bg-red-600/50';
                  }

                  let label: string;
                  if (face.childName) {
                    label = face.childName;
                  } else if (isManual) {
                    label = 'Drawn box';
                  } else {
                    label = 'Needs review';
                  }

                  return (
                    <button
                      key={face.id}
                      type="button"
                      disabled={drawMode}
                      onClick={(e) => {
                        if (drawMode) return;
                        e.stopPropagation();
                        setSelectedFaceId(face.id);
                      }}
                      title={label}
                      className={`absolute border-2 rounded-md transition-all ${borderClass}`}
                      style={{
                        left: `${left * 100}%`,
                        top: `${top * 100}%`,
                        width: `${width * 100}%`,
                        height: `${height * 100}%`,
                      }}
                    >
                      <span
                        className={`absolute left-1 top-1 text-[9px] leading-none px-1.5 py-0.5 rounded text-white font-bold backdrop-blur-sm ${labelBgClass}`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}

                {drawPreview && (
                  <div
                    className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none rounded-md"
                    style={{
                      left: `${drawPreview.left * 100}%`,
                      top: `${drawPreview.top * 100}%`,
                      width: `${drawPreview.width * 100}%`,
                      height: `${drawPreview.height * 100}%`,
                    }}
                  />
                )}

                {primaryPhoto.faces.length === 0 && !drawMode && (
                  <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground font-semibold bg-black/10">
                    <ScanFace className="w-5 h-5 mr-2 text-primary" />
                    No faces detected in this photo
                  </div>
                )}
              </div>
            </div>

            <div className="px-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-green-500/80" /> selected
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-red-500/80" /> needs review
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-amber-500/80" /> drawn box
              </span>
              {drawMode && (
                <span className="ml-auto text-primary font-semibold">
                  Drag on the photo to draw a new box. Release to finalize.
                </span>
              )}
            </div>
          </div>
        )}

        {teacherMode === 'focus' && selectedFace && primaryPhoto && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {selectedFace.thumbnail && (
                <img
                  src={selectedFace.thumbnail}
                  alt="Selected face"
                  className="w-10 h-10 rounded-md object-cover border border-border/40"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {selectedFace.childName
                    ? `Assigned: ${selectedFace.childName}`
                    : selectedFace.isManuallyAdded
                      ? 'Drawn box (no assignment yet)'
                      : 'Needs review'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedFace.childName
                    ? `${Math.round(selectedFace.similarity * 100)}% similarity · ${selectedFace.classGroup || '—'}`
                    : 'Pick a candidate below, or use "Add student manually" at the bottom.'}
                </p>
              </div>
              {selectedFace.childId && (
                <button
                  type="button"
                  onClick={() => handleAssignFace(selectedFace.id, null)}
                  className="h-7 px-2 text-[10px] font-semibold rounded-md border border-border/60 hover:bg-secondary"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemoveFace(selectedFace.id)}
                className="h-7 px-2 text-[10px] font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
                title="Remove this bounding box"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
              <button
                type="button"
                onClick={() => setSelectedFaceId(null)}
                className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            {selectedFace.candidates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedFace.candidates.map((candidate) => {
                  const isCurrent = candidate.child_id === selectedFace.childId;
                  const child = allChildren.find((c) => c.id === candidate.child_id);
                  const classGroup = child?.class_group || '';
                  return (
                    <button
                      key={candidate.child_id}
                      type="button"
                      onClick={() => handleAssignFace(selectedFace.id, candidate)}
                      className={`flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-white text-foreground border-border hover:border-primary/60 hover:bg-primary/5'
                      }`}
                    >
                      <span>{candidate.name}</span>
                      <span className={`text-[10px] ${isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {Math.round(candidate.similarity * 100)}%
                      </span>
                      {classGroup && (
                        <span className={`text-[10px] ${isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          · {classGroup}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                No close matches found. Pick any student below.
              </p>
            )}

            {/*
             * Per-box student override dropdown. Lists every enrolled student.
             * For students that appear in this face's candidates, the row shows
             * their similarity % between the name and the class. Picking a
             * student runs handleAssignFace (sync, no DB write) — the batch
             * Save button in the toolbar is what actually writes to Supabase.
             */}
            <div className="pt-1">
              <Select
                value={selectedFace.childId ?? ''}
                onValueChange={(childId) => {
                  if (!childId) return;
                  const child = allChildren.find((c) => c.id === childId);
                  if (!child) return;
                  const match = selectedFace.candidates.find((c) => c.child_id === childId);
                  const candidate: FaceCandidate = {
                    child_id: child.id,
                    name: child.name,
                    // Teacher override when not in candidates = full confidence.
                    similarity: match ? match.similarity : 1,
                  };
                  handleAssignFace(selectedFace.id, candidate);
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-white">
                  <SelectValue placeholder="Assign any enrolled student to this box..." />
                </SelectTrigger>
                <SelectContent>
                  {allChildren.map((child) => {
                    const match = selectedFace.candidates.find((c) => c.child_id === child.id);
                    const scoreText = match ? ` — ${Math.round(match.similarity * 100)}%` : '';
                    const classText = child.class_group ? ` — ${child.class_group}` : '';
                    return (
                      <SelectItem key={child.id} value={child.id} className="text-xs">
                        {child.name}{scoreText}{classText}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

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

      {teacherMode === 'focus' && !scanning && savedScans.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="font-medium">Main Focus: {includedCount} student{includedCount !== 1 ? 's' : ''} selected</span>
            <span className="font-medium">All photos: {totalUniqueFound} unique seen</span>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={pendingSaveFaces.length === 0 || savingAll}
            className="h-8 px-3 rounded-md text-xs font-semibold bg-primary text-primary-foreground flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {savingAll ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="w-3 h-3" /> Save {pendingSaveFaces.length} assignment{pendingSaveFaces.length === 1 ? '' : 's'}
              </>
            )}
          </button>
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

      {teacherMode === 'focus' && !scanning && primaryPhoto && currentPhotoTags.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          No students currently selected for this photo.
        </div>
      )}

      {teacherMode === 'focus' && !scanning && savedScans.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDrawMode((prev) => !prev);
              setSelectedFaceId(null);
              setDrawStart(null);
              setDrawCurrent(null);
            }}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              drawMode
                ? 'text-primary underline'
                : 'text-primary hover:underline'
            }`}
          >
            <SquareDashed className="w-3 h-3" />
            {drawMode ? 'Cancel drawing' : 'Add box (draw around missed person)'}
          </button>

          {showAddManual ? (
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
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

      {/* ── Enlarge Modal ───────────────────────────────────── */}
      {primaryPhoto && (
        <Dialog
          open={isEnlarged}
          onOpenChange={(open) => {
            setIsEnlarged(open);
            if (!open) {
              setDrawMode(false);
              setDrawStart(null);
              setDrawCurrent(null);
            }
          }}
        >
          <DialogContent className="max-w-[94vw] w-[94vw] max-h-[94vh] p-0 overflow-hidden flex flex-col gap-0">
            <DialogTitle className="sr-only">Main Focus Photo — Enlarged View</DialogTitle>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 flex-shrink-0">
              <Star className="w-3.5 h-3.5 text-primary fill-primary" />
              <span className="text-sm font-bold text-foreground">Main Focus Photo</span>
              <span className="text-[11px] text-muted-foreground ml-1">
                — {primaryPhoto.faces.length} face{primaryPhoto.faces.length !== 1 ? 's' : ''} detected
              </span>
            </div>

            {/* Body: image left, sidebar right */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* Left — image with overlays */}
              <div className="flex-1 min-w-0 overflow-auto bg-black/5">
                <div
                  className={`relative w-full ${drawMode ? 'cursor-crosshair' : ''}`}
                  onMouseDown={handleModalDrawMouseDown}
                  onMouseMove={handleModalDrawMouseMove}
                  onMouseUp={handleModalDrawMouseUp}
                  onMouseLeave={(e) => {
                    if (drawMode && drawStart) handleModalDrawMouseUp(e);
                  }}
                >
                  <img
                    ref={modalImgRef}
                    src={primaryPhoto.preview}
                    alt="Primary photo (enlarged)"
                    className="w-full h-auto block select-none"
                    draggable={false}
                  />

                  {primaryPhoto.faces.map((face) => {
                    const left = clampToUnit(face.box.x);
                    const top = clampToUnit(face.box.y);
                    const right = clampToUnit(face.box.x + face.box.width);
                    const bottom = clampToUnit(face.box.y + face.box.height);
                    const width = Math.max(0.01, right - left);
                    const height = Math.max(0.01, bottom - top);
                    const isIncluded = !!face.childId && !excludedStudentIds.has(face.childId);
                    const isSelected = selectedFaceId === face.id;
                    const isManual = face.isManuallyAdded;

                    let borderClass: string;
                    let labelBgClass: string;
                    if (isSelected) {
                      borderClass = 'border-primary bg-primary/20 ring-2 ring-primary/30';
                      labelBgClass = 'bg-primary';
                    } else if (isManual && !face.childId) {
                      borderClass = 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20';
                      labelBgClass = 'bg-amber-600/70';
                    } else if (isIncluded) {
                      borderClass = 'border-green-500/40 bg-green-500/10 hover:bg-green-500/20';
                      labelBgClass = 'bg-green-600/60';
                    } else {
                      borderClass = 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20';
                      labelBgClass = 'bg-red-600/50';
                    }

                    const label = face.childName
                      ? face.childName
                      : isManual
                        ? 'Drawn box'
                        : 'Needs review';

                    return (
                      <button
                        key={face.id}
                        type="button"
                        disabled={drawMode}
                        onClick={(e) => {
                          if (drawMode) return;
                          e.stopPropagation();
                          setSelectedFaceId(face.id);
                        }}
                        title={label}
                        className={`absolute border-2 rounded-md transition-all ${borderClass}`}
                        style={{
                          left: `${left * 100}%`,
                          top: `${top * 100}%`,
                          width: `${width * 100}%`,
                          height: `${height * 100}%`,
                        }}
                      >
                        <span
                          className={`absolute left-1 top-1 text-[10px] leading-none px-1.5 py-0.5 rounded text-white font-bold backdrop-blur-sm ${labelBgClass}`}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}

                  {drawPreview && (
                    <div
                      className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none rounded-md"
                      style={{
                        left: `${drawPreview.left * 100}%`,
                        top: `${drawPreview.top * 100}%`,
                        width: `${drawPreview.width * 100}%`,
                        height: `${drawPreview.height * 100}%`,
                      }}
                    />
                  )}

                  {primaryPhoto.faces.length === 0 && !drawMode && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground font-semibold bg-black/10">
                      <ScanFace className="w-5 h-5 mr-2 text-primary" />
                      No faces detected in this photo
                    </div>
                  )}
                </div>
              </div>

              {/* Right — sidebar controls */}
              <div className="w-[320px] flex-shrink-0 border-l border-border/40 overflow-y-auto flex flex-col gap-4 p-4">

                {/* Legend */}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-green-500/80" /> assigned
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-500/80" /> needs review
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" /> drawn box
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-primary/80" /> selected
                  </span>
                </div>

                {/* Selected face panel */}
                {selectedFace ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      {selectedFace.thumbnail && (
                        <img
                          src={selectedFace.thumbnail}
                          alt="Selected face"
                          className="w-10 h-10 rounded-md object-cover border border-border/40"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {selectedFace.childName
                            ? `Assigned: ${selectedFace.childName}`
                            : selectedFace.isManuallyAdded
                              ? 'Drawn box (no assignment yet)'
                              : 'Needs review'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {selectedFace.childName
                            ? `${Math.round(selectedFace.similarity * 100)}% similarity · ${selectedFace.classGroup || '—'}`
                            : 'Pick a candidate or use the dropdown below.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedFace.childId && (
                        <button
                          type="button"
                          onClick={() => handleAssignFace(selectedFace.id, null)}
                          className="h-7 px-2 text-[10px] font-semibold rounded-md border border-border/60 hover:bg-secondary"
                        >
                          Clear assignment
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveFace(selectedFace.id)}
                        className="h-7 px-2 text-[10px] font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove box
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFaceId(null)}
                        className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                      >
                        Deselect
                      </button>
                    </div>

                    {selectedFace.candidates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFace.candidates.map((candidate) => {
                          const isCurrent = candidate.child_id === selectedFace.childId;
                          const child = allChildren.find((c) => c.id === candidate.child_id);
                          const classGroup = child?.class_group || '';
                          return (
                            <button
                              key={candidate.child_id}
                              type="button"
                              onClick={() => handleAssignFace(selectedFace.id, candidate)}
                              className={`flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                isCurrent
                                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                  : 'bg-white text-foreground border-border hover:border-primary/60 hover:bg-primary/5'
                              }`}
                            >
                              <span>{candidate.name}</span>
                              <span className={`text-[10px] ${isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                {Math.round(candidate.similarity * 100)}%
                              </span>
                              {classGroup && (
                                <span className={`text-[10px] ${isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                  · {classGroup}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedFace.candidates.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic">
                        No close matches found. Pick any student below.
                      </p>
                    )}

                    <Select
                      value={selectedFace.childId ?? ''}
                      onValueChange={(childId) => {
                        if (!childId) return;
                        const child = allChildren.find((c) => c.id === childId);
                        if (!child) return;
                        const match = selectedFace.candidates.find((c) => c.child_id === childId);
                        const candidate: FaceCandidate = {
                          child_id: child.id,
                          name: child.name,
                          similarity: match ? match.similarity : 1,
                        };
                        handleAssignFace(selectedFace.id, candidate);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white">
                        <SelectValue placeholder="Assign any enrolled student..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allChildren.map((child) => {
                          const match = selectedFace.candidates.find((c) => c.child_id === child.id);
                          const scoreText = match ? ` — ${Math.round(match.similarity * 100)}%` : '';
                          const classText = child.class_group ? ` — ${child.class_group}` : '';
                          return (
                            <SelectItem key={child.id} value={child.id} className="text-xs">
                              {child.name}{scoreText}{classText}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">
                      Click a face box on the photo to select it and assign a student.
                    </p>
                  </div>
                )}

                {/* Draw controls */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawMode((prev) => !prev);
                      setSelectedFaceId(null);
                      setDrawStart(null);
                      setDrawCurrent(null);
                    }}
                    className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg border transition-colors ${
                      drawMode
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'border-border/60 text-primary hover:bg-primary/5'
                    }`}
                  >
                    <SquareDashed className="w-3.5 h-3.5" />
                    {drawMode ? 'Cancel drawing — click to stop' : 'Add box (draw around missed person)'}
                  </button>

                  {drawMode && (
                    <p className="text-[10px] text-primary text-center font-medium">
                      Drag on the photo to draw a new bounding box.
                    </p>
                  )}

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
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:underline font-medium py-2 px-3 rounded-lg border border-border/60 hover:bg-primary/5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add student manually (no face box)
                    </button>
                  )}
                </div>

                {/* Save */}
                <div className="mt-auto pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={pendingSaveFaces.length === 0 || savingAll}
                    className="w-full h-9 rounded-md text-xs font-semibold bg-primary text-primary-foreground flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                  >
                    {savingAll ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        {pendingSaveFaces.length > 0
                          ? `Save ${pendingSaveFaces.length} assignment${pendingSaveFaces.length === 1 ? '' : 's'}`
                          : 'No pending assignments'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
