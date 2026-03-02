import { useState, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, Loader2, UserPlus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { supabase } from '@/frontend/lib/supabase';
import { useFaceDetection } from '@/frontend/hooks/useFaceDetection';
import { getFaceCanvas } from '@/frontend/lib/faceUtils';
import { toast } from 'sonner';

interface StudentEnrolmentProps {
  onSuccess?: () => void;
}

export function StudentEnrolment({ onSuccess }: StudentEnrolmentProps) {
  const { modelsLoaded, getFullDetection } = useFaceDetection();
  const [name, setName] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [consent, setConsent] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setFacePreview(null);

    if (!modelsLoaded) return;

    // Auto-detect face from uploaded photo
    try {
      const img = await faceapi.bufferToImage(file);
      const detection = await getFullDetection(img);
      if (detection) {
        const thumbnail = getFaceCanvas(img, detection.detection.box);
        setFacePreview(thumbnail);
      }
    } catch (err) {
      console.error('Face preview error:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelsLoaded) {
      toast.error('Face recognition models are still loading...');
      return;
    }
    if (!consent) {
      toast.error('Parental consent is required.');
      return;
    }
    if (!photoFile) {
      toast.error('Please upload a photo.');
      return;
    }

    setIsProcessing(true);
    try {
      const img = await faceapi.bufferToImage(photoFile);
      const detection = await getFullDetection(img);

      if (!detection) {
        toast.error('No face detected. Please use a clearer photo.');
        return;
      }

      const faceThumbnail = getFaceCanvas(img, detection.detection.box);
      const embedding = Array.from(detection.descriptor);

      // Create child record
      const { data: childData, error: childError } = await supabase
        .from('children')
        .insert({ name, class_group: classGroup, consent_given: consent })
        .select()
        .single();

      if (childError) throw childError;

      // Save face signature
      const { error: sigError } = await supabase
        .from('face_signatures')
        .insert({
          child_id: childData.id,
          embedding,
          image_url: faceThumbnail,
          angle_label: 'FRONT',
        });

      if (sigError) throw sigError;

      toast.success(`${name} enrolled successfully!`);
      setName('');
      setClassGroup('');
      setConsent(false);
      setPhotoPreview(null);
      setFacePreview(null);
      setPhotoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enrolment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="student-name">Student Name</Label>
        <Input
          id="student-name"
          placeholder="e.g. Liam Chen"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isProcessing}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="class-group">Class Group</Label>
        <Input
          id="class-group"
          placeholder="e.g. K1-A"
          value={classGroup}
          onChange={(e) => setClassGroup(e.target.value)}
          required
          disabled={isProcessing}
        />
      </div>

      <div className="space-y-2">
        <Label>Student Photo</Label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors flex items-center gap-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
            disabled={isProcessing}
          />
          {photoPreview ? (
            <div className="flex items-center gap-4 w-full">
              <img
                src={photoPreview}
                alt="Upload preview"
                className="w-20 h-20 object-cover rounded-lg"
              />
              {facePreview ? (
                <div className="flex items-center gap-3">
                  <img
                    src={facePreview}
                    alt="Detected face"
                    className="w-14 h-14 rounded-full object-cover border-2 border-green-500"
                  />
                  <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Face detected
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {modelsLoaded ? 'No face detected — try another photo' : 'Loading face models...'}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Camera className="w-8 h-8" />
              <div>
                <p className="text-sm font-medium text-foreground">Click to upload a photo</p>
                <p className="text-xs">Clear front-facing photo works best</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          disabled={isProcessing}
        />
        <Label htmlFor="consent" className="text-sm font-normal cursor-pointer">
          Parental consent given for face recognition
        </Label>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isProcessing || !modelsLoaded || !name.trim() || !classGroup.trim() || !photoFile || !consent}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4 mr-2" />
            Register Student
          </>
        )}
      </Button>

      {!modelsLoaded && (
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading face recognition models...
        </p>
      )}
    </form>
  );
}
