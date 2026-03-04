import { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { Loader2, Camera, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { Badge } from '@/frontend/components/ui/badge';
import { Progress } from '@/frontend/components/ui/progress';
import { supabase } from '@/frontend/lib/supabase';
import { useFaceDetection } from '@/frontend/hooks/useFaceDetection';
import { getFaceCanvas } from '@/frontend/lib/faceUtils';
import { toast } from 'sonner';

type ScanState = 'IDLE' | 'FRONT' | 'LEFT' | 'RIGHT' | 'DONE';

interface CapturedAngle {
  descriptor: number[];
  image_url: string;
}

interface LiveScanEnrolmentProps {
  onSuccess?: () => void;
}

const THRESHOLDS = {
  FRONT: { min: 2.2, max: 2.6 },
  LEFT: 1.2,
  RIGHT: 12.8,
};

const STEP_LABELS: Record<ScanState, string> = {
  IDLE: '',
  FRONT: 'Look straight at the camera',
  LEFT: 'Turn your head slightly to the right',
  RIGHT: 'Turn your head slightly to the left',
  DONE: 'All angles captured!',
};

const STEP_PROGRESS: Record<ScanState, number> = {
  IDLE: 0,
  FRONT: 33,
  LEFT: 66,
  RIGHT: 100,
  DONE: 100,
};

function getNextState(current: ScanState): ScanState {
  if (current === 'FRONT') return 'LEFT';
  if (current === 'LEFT') return 'RIGHT';
  return 'DONE';
}

export function LiveScanEnrolment({ onSuccess }: LiveScanEnrolmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { modelsLoaded, getFullDetection } = useFaceDetection();

  const [currentState, setCurrentState] = useState<ScanState>('IDLE');
  const [name, setName] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [capturedData, setCapturedData] = useState<Record<string, CapturedAngle>>({});
  const [telemetry, setTelemetry] = useState({ score: 0, ratio: 0, detected: false });
  const [liveThumbnail, setLiveThumbnail] = useState<string | null>(null);
  const [lastDetection, setLastDetection] = useState<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isScanning = currentState !== 'IDLE' && currentState !== 'DONE';

  // Initialize / teardown webcam
  useEffect(() => {
    if (modelsLoaded && isScanning) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.error('Webcam Error:', err);
          toast.error('Could not access webcam');
        });
    }
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [modelsLoaded, isScanning]);

  const saveAngle = useCallback(
    (angle: ScanState, detection: NonNullable<typeof lastDetection>) => {
      const thumbnail = getFaceCanvas(videoRef.current!, detection.detection.box);
      setCapturedData((prev) => ({
        ...prev,
        [angle]: { descriptor: Array.from(detection.descriptor), image_url: thumbnail },
      }));
      setCurrentState(getNextState(angle));
    },
    []
  );

  // Detection loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (modelsLoaded && isScanning) {
      interval = setInterval(async () => {
        if (!videoRef.current) return;

        const detection = await getFullDetection(videoRef.current);
        if (!detection) {
          setTelemetry({ score: 0, ratio: 0, detected: false });
          setLiveThumbnail(null);
          return;
        }

        const landmarks = detection.landmarks;
        const nose = landmarks.getNose()[0];
        const leftEye = landmarks.getLeftEye()[0];
        const rightEye = landmarks.getRightEye()[0];
        const ratio = (nose.x - leftEye.x) / (rightEye.x - nose.x);

        setTelemetry({ score: detection.detection.score, ratio, detected: true });
        setLastDetection(detection);

        const preview = getFaceCanvas(videoRef.current!, detection.detection.box);
        setLiveThumbnail(preview);

        // Auto-capture when head pose matches target
        if (currentState === 'FRONT' && ratio > THRESHOLDS.FRONT.min && ratio < THRESHOLDS.FRONT.max) {
          saveAngle('FRONT', detection);
        } else if (currentState === 'LEFT' && ratio < THRESHOLDS.LEFT) {
          saveAngle('LEFT', detection);
        } else if (currentState === 'RIGHT' && ratio > THRESHOLDS.RIGHT) {
          saveAngle('RIGHT', detection);
        }
      }, 200);
    }
    return () => clearInterval(interval);
  }, [modelsLoaded, isScanning, currentState, getFullDetection, saveAngle]);

  const handleManualSnap = () => {
    if (lastDetection && isScanning) {
      saveAngle(currentState, lastDetection);
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: child, error: cErr } = await supabase
        .from('children')
        .insert({ name, class_group: classGroup, consent_given: true })
        .select()
        .single();

      if (cErr) throw cErr;

      const signatures = Object.keys(capturedData).map((angle) => ({
        child_id: child.id,
        embedding: capturedData[angle].descriptor,
        image_url: capturedData[angle].image_url,
        angle_label: angle,
      }));

      const { error: sErr } = await supabase.from('face_signatures').insert(signatures);
      if (sErr) throw sErr;

      toast.success(`${name} enrolled with 3D face profile!`);
      setCurrentState('IDLE');
      setName('');
      setClassGroup('');
      setCapturedData({});
      setLiveThumbnail(null);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enrolment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCurrentState('IDLE');
    setCapturedData({});
    setLiveThumbnail(null);
    setTelemetry({ score: 0, ratio: 0, detected: false });
  };

  // --- IDLE: Name + Class input ---
  if (currentState === 'IDLE') {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="live-name">Student Name</Label>
          <Input
            id="live-name"
            placeholder="e.g. Liam Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="live-class">Class Group</Label>
          <Input
            id="live-class"
            placeholder="e.g. K1-A"
            value={classGroup}
            onChange={(e) => setClassGroup(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          disabled={!name.trim() || !classGroup.trim() || !modelsLoaded}
          onClick={() => setCurrentState('FRONT')}
        >
          <Camera className="w-4 h-4 mr-2" />
          Start 3D Face Scan
        </Button>
        {!modelsLoaded && (
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading face recognition models...
          </p>
        )}
      </div>
    );
  }

  // --- DONE: Review + Submit ---
  if (currentState === 'DONE') {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-semibold">3D Face Mapping Complete</span>
        </div>

        <div className="flex justify-center gap-3">
          {(['FRONT', 'LEFT', 'RIGHT'] as const).map((angle) =>
            capturedData[angle] ? (
              <div key={angle} className="text-center">
                <img
                  src={capturedData[angle].image_url}
                  alt={angle}
                  className="w-20 h-20 rounded-lg object-cover border-2 border-green-200"
                />
                <p className="text-[11px] font-semibold text-muted-foreground mt-1">{angle}</p>
              </div>
            ) : null
          )}
        </div>

        <div className="text-sm text-muted-foreground text-center">
          Enrolling <span className="font-semibold text-foreground">{name}</span> in{' '}
          <span className="font-semibold text-foreground">{classGroup}</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleReset} disabled={isSubmitting}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Redo
          </Button>
          <Button className="flex-1" onClick={handleFinalSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save & Enrol'
            )}
          </Button>
        </div>
      </div>
    );
  }

  // --- SCANNING: Live webcam feed ---
  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            Step: {currentState}
          </Badge>
          <button onClick={handleReset} className="text-xs text-muted-foreground hover:underline">
            Cancel
          </button>
        </div>
        <Progress value={STEP_PROGRESS[currentState]} className="h-1.5" />
        <p className="text-sm text-center font-medium text-foreground">
          {STEP_LABELS[currentState]}
        </p>
      </div>

      {/* Video + Thumbnail side by side */}
      <div className="flex gap-3">
        {/* Live video feed */}
        <div className="relative flex-1">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full rounded-lg border-2 border-primary/50"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded">
            Live Feed
          </div>
          {telemetry.detected && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-green-600/80 text-white text-[10px] rounded">
              Face detected
            </div>
          )}
        </div>

        {/* Tuning panel */}
        <div className="w-[140px] shrink-0 space-y-3 bg-secondary/50 rounded-lg p-3 border border-border">
          <div>
            <p className="text-[10px] text-muted-foreground">Head Ratio</p>
            <p className="text-lg font-bold font-mono text-primary">
              {telemetry.detected ? telemetry.ratio.toFixed(2) : '—'}
            </p>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground">Target</p>
            <p className="text-[11px] font-mono text-foreground/70">
              {currentState === 'FRONT' && `${THRESHOLDS.FRONT.min} – ${THRESHOLDS.FRONT.max}`}
              {currentState === 'LEFT' && `< ${THRESHOLDS.LEFT}`}
              {currentState === 'RIGHT' && `> ${THRESHOLDS.RIGHT}`}
            </p>
          </div>

          {/* Live face crop preview */}
          <div className="w-full aspect-square rounded-md border border-border bg-black overflow-hidden">
            {liveThumbnail ? (
              <img src={liveThumbnail} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                No face
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full text-[11px] h-7"
            disabled={!telemetry.detected}
            onClick={handleManualSnap}
          >
            Manual Snap
          </Button>
        </div>
      </div>

      {/* Captured angles so far */}
      {Object.keys(capturedData).length > 0 && (
        <div className="flex gap-2 justify-center">
          {Object.entries(capturedData).map(([angle, data]) => (
            <div key={angle} className="text-center">
              <img
                src={data.image_url}
                alt={angle}
                className="w-12 h-12 rounded-md object-cover border-2 border-green-300"
              />
              <p className="text-[9px] font-semibold text-green-600 mt-0.5">{angle}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
