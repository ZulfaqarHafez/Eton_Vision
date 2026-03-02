import { useState, useEffect, useRef } from 'react';
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

interface FaceTagPanelProps {
  imageFile: File | null;
  imagePreview: string | null;
  onTagsChange: (tags: TaggedChild[]) => void;
}

interface DetectedFace {
  descriptor: number[];
  match: { child_id: string; name: string; similarity: number } | null;
  thumbnail: string;
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

  // Fetch enrolled children for manual assignment
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
      lastScannedFile.current = null;
    }
  }, [imageFile, modelsLoaded]);

  // Propagate tag changes to parent
  useEffect(() => {
    onTagsChange(taggedChildren);
  }, [taggedChildren]);

  const scanImage = async (file: File) => {
    setScanning(true);
    setDetectedFaces([]);
    setTaggedChildren([]);
    setHasScanned(false);

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
      const sorted = [...detections].sort(
        (a, b) => b.detection.score - a.detection.score
      );

      for (const detection of sorted) {
        const embedding = Array.from(detection.descriptor);
        const thumbnail = getFaceCanvas(img, detection.detection.box);
        const match = await matchFace(embedding);

        if (match && !usedChildIds.has(match.child_id)) {
          usedChildIds.add(match.child_id);
          results.push({ descriptor: embedding, match, thumbnail });
          tags.push({
            id: match.child_id,
            name: match.name,
            confidence: match.similarity,
            thumbnail,
          });
        } else {
          results.push({ descriptor: embedding, match: null, thumbnail });
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
  };

  const addManualTag = (childId: string) => {
    if (taggedChildren.some((t) => t.id === childId)) return;
    const child = allChildren.find((c) => c.id === childId);
    if (!child) return;
    setTaggedChildren((prev) => [
      ...prev,
      { id: child.id, name: child.name, confidence: 1.0 },
    ]);
    setShowAddManual(false);
  };

  const assignUnknownFace = (faceIndex: number, childId: string) => {
    const child = allChildren.find((c) => c.id === childId);
    if (!child || taggedChildren.some((t) => t.id === childId)) return;

    const face = detectedFaces[faceIndex];
    setTaggedChildren((prev) => [
      ...prev,
      { id: child.id, name: child.name, confidence: 1.0, thumbnail: face.thumbnail },
    ]);

    // Mark face as matched in local state
    setDetectedFaces((prev) =>
      prev.map((f, i) =>
        i === faceIndex
          ? { ...f, match: { child_id: child.id, name: child.name, similarity: 1.0 } }
          : f
      )
    );
  };

  // Don't render anything if no image
  if (!imagePreview) return null;

  const unknownFaces = detectedFaces.filter((f) => !f.match);
  const availableChildren = allChildren.filter(
    (c) => !taggedChildren.some((t) => t.id === c.id)
  );

  return (
    <div className="space-y-3">
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
            <button
              onClick={() => setShowAddManual(true)}
              className="text-primary hover:underline"
            >
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
                <AvatarFallback className="text-[8px]">
                  {child.name.charAt(0)}
                </AvatarFallback>
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

      {/* Unknown faces */}
      {unknownFaces.length > 0 && !scanning && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium">
            {unknownFaces.length} unrecognised face{unknownFaces.length > 1 ? 's' : ''}:
          </p>
          <div className="flex flex-wrap gap-2">
            {unknownFaces.map((face, globalIdx) => {
              const faceIndex = detectedFaces.indexOf(face);
              return (
                <div key={globalIdx} className="flex items-center gap-1.5">
                  <Avatar className="w-8 h-8 border-2 border-amber-300">
                    <AvatarImage src={face.thumbnail} />
                    <AvatarFallback className="text-[10px]">?</AvatarFallback>
                  </Avatar>
                  {availableChildren.length > 0 && (
                    <Select onValueChange={(val) => assignUnknownFace(faceIndex, val)}>
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue placeholder="Assign..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableChildren.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
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
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowAddManual(false)}
              >
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
