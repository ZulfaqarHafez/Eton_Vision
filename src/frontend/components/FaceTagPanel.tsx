import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { Loader2, X, UserPlus, Scan } from 'lucide-react';
import { Badge } from '@/frontend/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Button } from '@/frontend/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/frontend/components/ui/avatar';
import { supabase, matchFace, type Child, type TaggedChild } from '@/frontend/lib/supabase';
import { useFaceDetection } from '@/frontend/hooks/useFaceDetection';
import { getFaceCanvas } from '@/frontend/lib/faceUtils';
import { toast } from 'sonner';

interface FaceTagPanelProps {
  imageFile: File | null;
  imagePreview: string | null;
  onTagsChange: (tags: TaggedChild[]) => void;
}

interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
  match: { child_id: string; name: string; similarity: number } | null;
  thumbnail: string;
}

interface PendingTag {
  faceIndex: number;
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
  isEdit: boolean;
  // Position for the popover (relative to canvas container)
  popoverTop: number;
  popoverLeft: number;
}

interface SessionOverride {
  box: { x: number; y: number; width: number; height: number };
  child_id: string;
  name: string;
}

export function FaceTagPanel({ imageFile, imagePreview, onTagsChange }: FaceTagPanelProps) {
  const { modelsLoaded, getAllDetections } = useFaceDetection();
  const [scanning, setScanning] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [taggedChildren, setTaggedChildren] = useState<TaggedChild[]>([]);
  const [allChildren, setAllChildren] = useState<Child[]>([]);
  const [showAddManual, setShowAddManual] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const lastScannedFile = useRef<File | null>(null);

  // GroupTagger interactive state
  const [pendingTag, setPendingTag] = useState<PendingTag | null>(null);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [sessionOverrides, setSessionOverrides] = useState<SessionOverride[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawBox, setDrawBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch enrolled children
  useEffect(() => {
    async function fetchChildren() {
      const { data } = await supabase.from('children').select('*').order('name');
      if (data) setAllChildren(data);
    }
    fetchChildren();
  }, []);

  // Auto-scan when image changes
  useEffect(() => {
    if (imageFile && modelsLoaded && imageFile !== lastScannedFile.current) {
      lastScannedFile.current = imageFile;
      scanImage(imageFile);
    }
    if (!imageFile) {
      setDetectedFaces([]);
      setTaggedChildren([]);
      setHasScanned(false);
      setPendingTag(null);
      setDrawBox(null);
      lastScannedFile.current = null;
    }
  }, [imageFile, modelsLoaded]);

  // Propagate tag changes to parent
  useEffect(() => {
    onTagsChange(taggedChildren);
  }, [taggedChildren]);

  // Redraw canvas whenever detections or draw state change
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale factor: displayed size vs natural size
    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;

    // Draw detection boxes
    for (const face of detectedFaces) {
      const x = face.box.x * scaleX;
      const y = face.box.y * scaleY;
      const w = face.box.width * scaleX;
      const h = face.box.height * scaleY;

      if (face.match) {
        // Green for matched
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Label
        const label = face.match.name;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(x, y - 18, textWidth + 8, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 4, y - 5);
      } else {
        // Red for unknown
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.font = 'bold 11px sans-serif';
        const label = 'Unknown';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x, y - 18, textWidth + 8, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 4, y - 5);
      }
    }

    // Draw in-progress drawing box
    if (drawBox) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(drawBox.x, drawBox.y, drawBox.width, drawBox.height);
      ctx.setLineDash([]);
    }
  }, [detectedFaces, drawBox]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Also redraw on image load
  const handleImageLoad = () => {
    drawCanvas();
  };

  const isPointInBox = (px: number, py: number, box: { x: number; y: number; width: number; height: number }) => {
    return px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
  };

  const getCanvasCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Convert displayed coords to natural image coords
  const toNaturalCoords = (displayX: number, displayY: number) => {
    const img = imgRef.current!;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    return { x: displayX * scaleX, y: displayY * scaleY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scanning || pendingTag) return;
    const { x, y } = getCanvasCoords(e);

    const img = imgRef.current!;
    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;

    // Check if clicked on an existing detection box
    const clickedIdx = detectedFaces.findIndex((f) => {
      const bx = f.box.x * scaleX;
      const by = f.box.y * scaleY;
      const bw = f.box.width * scaleX;
      const bh = f.box.height * scaleY;
      return isPointInBox(x, y, { x: bx, y: by, width: bw, height: bh });
    });

    if (clickedIdx !== -1) {
      const face = detectedFaces[clickedIdx];
      const bx = face.box.x * scaleX;
      const bw = face.box.width * scaleX;
      const by = face.box.y * scaleY;
      setPendingTag({
        faceIndex: clickedIdx,
        box: face.box,
        descriptor: face.descriptor,
        isEdit: true,
        popoverTop: by,
        popoverLeft: bx + bw + 8,
      });
      if (face.match) setSelectedChildId(face.match.child_id);
      return;
    }

    // Start drawing a new box
    setDrawStart({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);
    setDrawBox({
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      width: Math.abs(x - drawStart.x),
      height: Math.abs(y - drawStart.y),
    });
  };

  const handleMouseUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (!drawBox || drawBox.width < 20 || drawBox.height < 20) {
      setDrawBox(null);
      return;
    }

    // Convert drawn box to natural image coords for face detection
    const natTopLeft = toNaturalCoords(drawBox.x, drawBox.y);
    const natBottomRight = toNaturalCoords(drawBox.x + drawBox.width, drawBox.y + drawBox.height);
    const naturalBox = {
      x: natTopLeft.x,
      y: natTopLeft.y,
      width: natBottomRight.x - natTopLeft.x,
      height: natBottomRight.y - natTopLeft.y,
    };

    // Try to detect a face in the full image (face-api doesn't support region crops easily)
    // We'll use the drawn box as the bounding box and try to get a descriptor
    try {
      const img = imgRef.current!;
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        setPendingTag({
          faceIndex: -1,
          box: naturalBox,
          descriptor: Array.from(detection.descriptor),
          isEdit: false,
          popoverTop: drawBox.y,
          popoverLeft: drawBox.x + drawBox.width + 8,
        });
      } else {
        toast.error('No face detected in this area.');
        setDrawBox(null);
      }
    } catch {
      setDrawBox(null);
    }
  };

  const saveVerification = async () => {
    if (!selectedChildId || !pendingTag) return;
    const isUnknown = selectedChildId === 'UNKNOWN_PERSON';
    const selectedChild = allChildren.find((c) => c.id === selectedChildId);

    try {
      // Active learning: save verified face as new signature
      if (!isUnknown && selectedChild && imgRef.current) {
        const faceThumbnail = getFaceCanvas(imgRef.current, pendingTag.box);

        await supabase.from('face_signatures').insert({
          child_id: selectedChildId,
          embedding: pendingTag.descriptor,
          image_url: faceThumbnail,
          angle_label: 'AUTO_VERIFIED',
        });

        // Session override — persist correction for re-scans
        setSessionOverrides((prev) => [
          ...prev,
          { box: pendingTag.box, child_id: selectedChildId, name: selectedChild.name },
        ]);

        // Update detectedFaces to reflect the correction
        if (pendingTag.faceIndex >= 0) {
          setDetectedFaces((prev) =>
            prev.map((f, i) =>
              i === pendingTag.faceIndex
                ? { ...f, match: { child_id: selectedChildId, name: selectedChild.name, similarity: 1.0 } }
                : f
            )
          );
        }

        // Update tagged children
        if (!taggedChildren.some((t) => t.id === selectedChildId)) {
          const thumbnail = getFaceCanvas(imgRef.current, pendingTag.box);
          setTaggedChildren((prev) => [
            ...prev,
            { id: selectedChildId, name: selectedChild.name, class_group: selectedChild.class_group || '', confidence: 1.0, thumbnail },
          ]);
        }

        toast.success(`Verified ${selectedChild.name} — saved to AI training data`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    }

    setPendingTag(null);
    setDrawBox(null);
    setSelectedChildId('');
  };

  const cancelPending = () => {
    setPendingTag(null);
    setDrawBox(null);
    setSelectedChildId('');
  };

  const scanImage = async (file: File) => {
    setScanning(true);
    setDetectedFaces([]);
    setTaggedChildren([]);
    setHasScanned(false);
    setPendingTag(null);
    setDrawBox(null);

    try {
      const img = await faceapi.bufferToImage(file);
      const detections = await getAllDetections(img);

      if (!detections || detections.length === 0) {
        setHasScanned(true);
        return;
      }

      const results: DetectedFace[] = [];
      const tags: TaggedChild[] = [];
      const usedChildIds = new Set<string>();

      // Sort by confidence descending for deduplication
      const sorted = [...detections].sort((a, b) => b.detection.score - a.detection.score);

      for (const detection of sorted) {
        const embedding = Array.from(detection.descriptor);
        const box = detection.detection.box;
        const thumbnail = getFaceCanvas(img, box);

        // Check for session overrides first
        const override = sessionOverrides.find((ov) =>
          isPointInBox(box.x + 10, box.y + 10, ov.box)
        );

        if (override && !usedChildIds.has(override.child_id)) {
          usedChildIds.add(override.child_id);
          const match = { child_id: override.child_id, name: override.name, similarity: 1.0 };
          results.push({ box, descriptor: embedding, match, thumbnail });
          const overrideChild = allChildren.find((c) => c.id === override.child_id);
          tags.push({ id: override.child_id, name: override.name, class_group: overrideChild?.class_group || '', confidence: 1.0, thumbnail });
          continue;
        }

        const match = await matchFace(embedding);

        if (match && !usedChildIds.has(match.child_id)) {
          usedChildIds.add(match.child_id);
          results.push({ box, descriptor: embedding, match, thumbnail });
          const matchedChild = allChildren.find((c) => c.id === match.child_id);
          tags.push({ id: match.child_id, name: match.name, class_group: matchedChild?.class_group || '', confidence: match.similarity, thumbnail });
        } else {
          results.push({ box, descriptor: embedding, match: null, thumbnail });
        }
      }

      setDetectedFaces(results);
      setTaggedChildren(tags);
    } catch (err) {
      console.error('Face scan error:', err);
    } finally {
      setScanning(false);
      setHasScanned(true);
    }
  };

  const removeTag = (childId: string) => {
    setTaggedChildren((prev) => prev.filter((t) => t.id !== childId));
    // Also unmark the detection
    setDetectedFaces((prev) =>
      prev.map((f) => (f.match?.child_id === childId ? { ...f, match: null } : f))
    );
  };

  const addManualTag = (childId: string) => {
    if (taggedChildren.some((t) => t.id === childId)) return;
    const child = allChildren.find((c) => c.id === childId);
    if (!child) return;
    setTaggedChildren((prev) => [...prev, { id: child.id, name: child.name, class_group: child.class_group || '', confidence: 1.0 }]);
    setShowAddManual(false);
  };

  // Don't render anything if no image
  if (!imagePreview) return null;

  const unknownFaces = detectedFaces.filter((f) => !f.match);
  const availableChildren = allChildren.filter((c) => !taggedChildren.some((t) => t.id === c.id));

  return (
    <div className="space-y-3">
      {/* Image with canvas overlay for bounding boxes */}
      <div ref={containerRef} className="relative panel-card overflow-hidden rounded-xl" style={{ cursor: hasScanned && !pendingTag ? 'crosshair' : 'default' }}>
        <img
          ref={imgRef}
          src={imagePreview}
          alt="Uploaded preview"
          className="w-full"
          style={{ maxHeight: 280, objectFit: 'cover' }}
          onLoad={handleImageLoad}
        />
        {hasScanned && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
        )}

        {/* Popover for click-to-correct */}
        {pendingTag && (
          <div
            className="absolute z-50 bg-card border-2 rounded-lg shadow-lg p-3 min-w-[180px]"
            style={{
              top: pendingTag.popoverTop,
              left: Math.min(pendingTag.popoverLeft, containerRef.current ? containerRef.current.clientWidth - 200 : 200),
              borderColor: pendingTag.isEdit ? '#22c55e' : '#3b82f6',
            }}
          >
            <p className="text-xs font-bold text-foreground mb-2">
              {pendingTag.isEdit ? 'Correct ID:' : 'Assign face:'}
            </p>
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="h-7 text-xs mb-2">
                <SelectValue placeholder="Select child..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNKNOWN_PERSON" className="text-xs">
                  — Unknown —
                </SelectItem>
                {allChildren.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                disabled={!selectedChildId}
                onClick={saveVerification}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 h-7 text-xs"
                onClick={cancelPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tip when faces detected */}
      {hasScanned && detectedFaces.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Click a box to correct a name. Drag to draw a box for missed faces.
        </p>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tagged Students
        </label>
        {scanning && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            Scanning faces...
          </div>
        )}
        {!scanning && hasScanned && (
          <button
            onClick={() => imageFile && scanImage(imageFile)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Scan className="w-3 h-3" />
            Re-scan
          </button>
        )}
      </div>

      {/* Loading state */}
      {scanning && taggedChildren.length === 0 && (
        <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground rounded-xl border border-dashed border-border">
          <Loader2 className="w-4 h-4 animate-spin" />
          Detecting faces in image...
        </div>
      )}

      {/* No faces found */}
      {!scanning && hasScanned && detectedFaces.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">
          No faces detected.{' '}
          {allChildren.length > 0 && (
            <button onClick={() => setShowAddManual(true)} className="text-primary hover:underline">
              Add students manually
            </button>
          )}
        </div>
      )}

      {/* Tagged children badges */}
      {taggedChildren.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {taggedChildren.map((child) => (
            <Badge
              key={child.id}
              variant="secondary"
              className="pl-1 pr-2 py-1 gap-2 text-sm font-medium border border-green-200 bg-green-50 text-green-800"
            >
              <Avatar className="w-5 h-5">
                {child.thumbnail && <AvatarImage src={child.thumbnail} />}
                <AvatarFallback className="text-[8px]">{child.name.charAt(0)}</AvatarFallback>
              </Avatar>
              {child.name}
              {child.confidence < 1.0 && (
                <span className="text-[10px] text-green-600">
                  {Math.round(child.confidence * 100)}%
                </span>
              )}
              <button
                onClick={() => removeTag(child.id)}
                className="ml-0.5 hover:bg-green-200 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Unknown faces with thumbnails */}
      {unknownFaces.length > 0 && !scanning && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium">
            {unknownFaces.length} unrecognised face{unknownFaces.length > 1 ? 's' : ''} — click on
            the box above to assign
          </p>
        </div>
      )}

      {/* Manual add button */}
      {!scanning && hasScanned && availableChildren.length > 0 && (
        <div>
          {showAddManual ? (
            <div className="flex items-center gap-2">
              <Select onValueChange={addManualTag}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select a student..." />
                </SelectTrigger>
                <SelectContent>
                  {availableChildren.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name} — {c.class_group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowAddManual(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddManual(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <UserPlus className="w-3 h-3" />
              Add student manually
            </button>
          )}
        </div>
      )}

      {/* Models loading */}
      {!modelsLoaded && imageFile && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading face recognition models...
        </div>
      )}
    </div>
  );
}
