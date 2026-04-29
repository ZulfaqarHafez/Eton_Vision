import React, { useState, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, Loader2, UserPlus, CheckCircle2, CloudUpload } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { supabase } from '../lib/supabase';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { getFaceCanvas } from '../lib/faceUtils';
import { toast } from 'sonner';

export function StudentEnrolment({ onSuccess }: { onSuccess?: () => void }) {
  const { modelsLoaded, getFullDetection } = useFaceDetection();
  const [name, setName] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [consent, setConsent] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setPhotoFiles(files);
    const newPreviews = files.map(file => URL.createObjectURL(file as File));
    setPhotoPreviews(newPreviews);
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
    if (photoFiles.length === 0) {
      toast.error('Please upload at least one photo.');
      return;
    }

    setIsProcessing(true);
    let childId: string | null = null;

    try {
      // 1. Create child record first
      const { data: childData, error: childError } = await supabase
        .from('children')
        .insert({ 
          name, 
          class_group: classGroup, 
          consent_given: consent 
        })
        .select()
        .single();

      if (childError) throw childError;
      childId = childData.id;

      const signatureInserts = [];

      // 2. Process each photo
      for (const file of photoFiles) {
        const img = await faceapi.bufferToImage(file);
        const detection = await getFullDetection(img);

        // CHANGE THIS: Skip instead of throwing an error
        if (!detection) {
          console.warn(`Skipping image ${file.name} - no face detected`);
          continue; 
        }

        const faceThumbnailString = getFaceCanvas(img, detection.detection.box);
        
        signatureInserts.push({
          child_id: childId,
          embedding: Array.from(detection.descriptor),
          mediapipe_embedding: Array.from(detection.mediaPipeDescriptor),
          image_url: faceThumbnailString, 
          angle_label: 'ENROLMENT_BATCH',
        });
      }

// Ensure at least ONE face was found before proceeding
if (signatureInserts.length === 0) {
  throw new Error("AI could not find a clear face in ANY of the uploaded photos.");
}

      // 3. Save all face signatures
      const { error: sigError } = await supabase
        .from('face_signatures')
        .insert(signatureInserts);

      if (sigError) throw sigError;

      toast.success(`${name} enrolled successfully with ${photoFiles.length} photos!`);
      
      // Reset form
      setName('');
      setClassGroup('');
      setConsent(false);
      setPhotoPreviews([]);
      setPhotoFiles([]);
      if (onSuccess) onSuccess();
      
    } catch (err: any) {
      // Cleanup: If signatures failed, remove the student record
      if (childId) {
        await supabase.from('children').delete().eq('id', childId);
      }
      toast.error(err.message || 'Enrolment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 p-1">
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
          <Select onValueChange={setClassGroup} value={classGroup}>
            <SelectTrigger>
              <SelectValue placeholder="Select Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Vanda-K2">Vanda-K2</SelectItem>
              <SelectItem value="Zhong Hua">Zhong Hua</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Student Photos (Multiple)</Label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors flex flex-col items-center gap-4"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoSelect}
              disabled={isProcessing}
            />
            
            {photoPreviews.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 w-full">
                {photoPreviews.map((src, i) => (
                  <img key={i} src={src} className="h-20 w-full object-cover rounded-md border" alt="preview" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center text-muted-foreground">
                <CloudUpload className="w-8 h-8 mb-2" />
                <p className="text-sm font-medium text-foreground">Click to upload photos</p>
                <p className="text-xs">Front-facing photos work best</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
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
          disabled={isProcessing || !modelsLoaded || !name.trim() || !classGroup || photoFiles.length === 0 || !consent}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Analysing Faces...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4 mr-2" />
              Register Student
            </>
          )}
        </Button>
      </form>
    </div>
  );
}