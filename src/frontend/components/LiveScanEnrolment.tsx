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

type ScanAngle = 'FRONT' | 'LEFT' | 'RIGHT' | 'TOP_DOWN' | 'DEEP_PROFILE' | 'BACK';
type ScanState = 'IDLE' | ScanAngle | 'DONE';

type FullDetection = faceapi.WithFaceDescriptor<
  faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>
>;

interface CapturedAngle {
  descriptor: number[] | null;
  image_url: string;
}

interface LiveScanEnrolmentProps {
  onSuccess?: () => void;
}

interface NormalizedFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampToUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

const SCAN_SEQUENCE: ScanAngle[] = ['FRONT', 'LEFT', 'RIGHT', 'TOP_DOWN', 'DEEP_PROFILE', 'BACK'];

const THRESHOLDS = {
  FRONT: { min: 2.2, max: 2.6 },
  LEFT: 1.2,
  RIGHT: 12.8,
  TOP_DOWN: 1.05,
  DEEP_PROFILE: { minLeft: 0.8, minRight: 16.0 },
};

const ANGLE_DETAILS: Record<ScanAngle, { label: string; instruction: string; target: string }> = {
  FRONT: {
    label: 'Front',
    instruction: 'Look straight at the camera',
    target: `${THRESHOLDS.FRONT.min} - ${THRESHOLDS.FRONT.max}`,
  },
  LEFT: {
    label: 'Left 3/4',
    instruction: 'Turn your head slightly to the right',
    target: `< ${THRESHOLDS.LEFT}`,
  },
  RIGHT: {
    label: 'Right 3/4',
    instruction: 'Turn your head slightly to the left',
    target: `> ${THRESHOLDS.RIGHT}`,
  },
  TOP_DOWN: {
    label: 'Top-down',
    instruction: 'Tilt your head downward so your forehead is more visible',
    target: `pitch > ${THRESHOLDS.TOP_DOWN}`,
  },
  DEEP_PROFILE: {
    label: 'Deep profile',
    instruction: 'Turn further to either side for a stronger profile view',
    target: `< ${THRESHOLDS.DEEP_PROFILE.minLeft} or > ${THRESHOLDS.DEEP_PROFILE.minRight}`,
  },
  BACK: {
    label: 'Back of head',
    instruction: 'Turn away and take one reference capture of the back of head',
    target: 'manual capture',
  },
};

function getNextState(current: ScanAngle): ScanState {
  const idx = SCAN_SEQUENCE.indexOf(current);
  if (idx === -1 || idx === SCAN_SEQUENCE.length - 1) return 'DONE';
  return SCAN_SEQUENCE[idx + 1];
}

function getStepProgress(current: ScanState): number {
  if (current === 'IDLE') return 0;
  if (current === 'DONE') return 100;

  const stepIndex = SCAN_SEQUENCE.indexOf(current);
  if (stepIndex === -1) return 0;

  return Math.round(((stepIndex + 1) / SCAN_SEQUENCE.length) * 100);
}

function averageY(points: faceapi.Point[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + point.y, 0) / points.length;
}

export function LiveScanEnrolment({ onSuccess }: LiveScanEnrolmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { modelsLoaded, getFullDetection } = useFaceDetection();

  const [currentState, setCurrentState] = useState<ScanState>('IDLE');
  const [name, setName] = useState('');
  const [classGroup, setClassGroup] = useState('');
  const [capturedData, setCapturedData] = useState<Record<string, CapturedAngle>>({});
  const [telemetry, setTelemetry] = useState({ score: 0, ratio: 0, pitch: 0, detected: false });
  const [liveThumbnail, setLiveThumbnail] = useState<string | null>(null);
  const [liveFaceBox, setLiveFaceBox] = useState<NormalizedFaceBox | null>(null);
  const [lastDetection, setLastDetection] = useState<FullDetection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isScanning = currentState !== 'IDLE' && currentState !== 'DONE';
  const capturedAngles = SCAN_SEQUENCE.filter((angle) => Boolean(capturedData[angle]));
  const coverageProgress = Math.round((capturedAngles.length / SCAN_SEQUENCE.length) * 100);
  const descriptorCount = SCAN_SEQUENCE.filter((angle) => Boolean(capturedData[angle]?.descriptor)).length;
  const currentAngle = currentState !== 'IDLE' && currentState !== 'DONE' ? currentState : null;
  const currentAngleDetails = currentAngle ? ANGLE_DETAILS[currentAngle] : null;

  const captureVideoFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  // Initialize / teardown webcam
  useEffect(() => {
    const videoElement = videoRef.current;

    if (modelsLoaded && isScanning && videoElement) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
          videoElement.srcObject = stream;
        })
        .catch((err) => {
          console.error('Webcam Error:', err);
          toast.error('Could not access webcam');
        });
    }

    return () => {
      const stream = videoElement?.srcObject;
      if (stream) {
        (stream as MediaStream).getTracks().forEach((t) => t.stop());
        videoElement.srcObject = null;
      }
    };
  }, [modelsLoaded, isScanning]);

  const saveAngle = useCallback(
    (angle: ScanAngle, detection: FullDetection | null) => {
      if (!videoRef.current) return;

      const thumbnail = detection
        ? getFaceCanvas(videoRef.current, detection.detection.box)
        : captureVideoFrame();

      if (!thumbnail) {
        toast.error('Could not capture this angle. Please try again.');
        return;
      }

      setCapturedData((prev) => ({
        ...prev,
        [angle]: {
          descriptor: detection ? Array.from(detection.descriptor) : null,
          image_url: thumbnail,
        },
      }));

      setCurrentState(getNextState(angle));
    },
    [captureVideoFrame]
  );

  // Detection loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (modelsLoaded && isScanning) {
      interval = setInterval(async () => {
        if (!videoRef.current) return;

        const detection = await getFullDetection(videoRef.current);
        if (!detection) {
          setTelemetry({ score: 0, ratio: 0, pitch: 0, detected: false });
          setLastDetection(null);
          setLiveThumbnail(null);
          setLiveFaceBox(null);
          return;
        }

        const landmarks = detection.landmarks;
        const nosePoints = landmarks.getNose();
        const noseTip = nosePoints[Math.floor(nosePoints.length / 2)] ?? nosePoints[0];
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const mouth = landmarks.getMouth();

        const leftEyeAnchor = leftEye[0] ?? noseTip;
        const rightEyeAnchor = rightEye[0] ?? noseTip;
        const yawDenominator = Math.max(0.001, rightEyeAnchor.x - noseTip.x);
        const ratio = (noseTip.x - leftEyeAnchor.x) / yawDenominator;

        const eyeCenterY = (averageY(leftEye) + averageY(rightEye)) / 2;
        const mouthCenterY = averageY(mouth);
        const pitch = (noseTip.y - eyeCenterY) / Math.max(1, mouthCenterY - noseTip.y);

        setTelemetry({ score: detection.detection.score, ratio, pitch, detected: true });
        setLastDetection(detection);

        const videoWidth = videoRef.current.videoWidth || 640;
        const videoHeight = videoRef.current.videoHeight || 480;
        const box = detection.detection.box;
        setLiveFaceBox({
          x: clampToUnit(box.x / videoWidth),
          y: clampToUnit(box.y / videoHeight),
          width: clampToUnit(box.width / videoWidth),
          height: clampToUnit(box.height / videoHeight),
        });

        const preview = getFaceCanvas(videoRef.current!, detection.detection.box);
        setLiveThumbnail(preview);

        // Auto-capture when head pose matches target
        if (currentState === 'FRONT' && ratio > THRESHOLDS.FRONT.min && ratio < THRESHOLDS.FRONT.max) {
          saveAngle('FRONT', detection);
        } else if (currentState === 'LEFT' && ratio < THRESHOLDS.LEFT) {
          saveAngle('LEFT', detection);
        } else if (currentState === 'RIGHT' && ratio > THRESHOLDS.RIGHT) {
          saveAngle('RIGHT', detection);
        } else if (currentState === 'TOP_DOWN' && pitch > THRESHOLDS.TOP_DOWN) {
          saveAngle('TOP_DOWN', detection);
        } else if (
          currentState === 'DEEP_PROFILE' &&
          (ratio < THRESHOLDS.DEEP_PROFILE.minLeft || ratio > THRESHOLDS.DEEP_PROFILE.minRight)
        ) {
          saveAngle('DEEP_PROFILE', detection);
        }
      }, 200);
    }
    return () => clearInterval(interval);
  }, [modelsLoaded, isScanning, currentState, getFullDetection, saveAngle]);

  const handleManualSnap = () => {
    if (!isScanning) return;

    if (currentState === 'BACK') {
      saveAngle('BACK', lastDetection);
      return;
    }

    if (lastDetection) {
      saveAngle(currentState, lastDetection);
    }
  };

  const handleFinalSubmit = async () => {
    const signatures = SCAN_SEQUENCE.flatMap((angle) => {
      const capture = capturedData[angle];
      if (!capture?.descriptor) return [];

      return [{
        embedding: capture.descriptor,
        image_url: capture.image_url,
        angle_label: angle,
      }];
    });

    if (signatures.length === 0) {
      toast.error('No face descriptors captured. Please run the scan again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: child, error: cErr } = await supabase
        .from('children')
        .insert({ name, class_group: classGroup, consent_given: true })
        .select()
        .single();

      if (cErr) throw cErr;

      const signatureRows = signatures.map((signature) => ({
        child_id: child.id,
        embedding: signature.embedding,
        image_url: signature.image_url,
        angle_label: signature.angle_label,
      }));

      const { error: sErr } = await supabase.from('face_signatures').insert(signatureRows);
      if (sErr) throw sErr;

      toast.success(`${name} enrolled with ${signatureRows.length} angle descriptors`);
      setCurrentState('IDLE');
      setName('');
      setClassGroup('');
      setCapturedData({});
      setLiveThumbnail(null);
      setLiveFaceBox(null);
      setLastDetection(null);
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
    setLiveFaceBox(null);
    setTelemetry({ score: 0, ratio: 0, pitch: 0, detected: false });
    setLastDetection(null);
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
          onClick={() => setCurrentState(SCAN_SEQUENCE[0])}
        >
          <Camera className="w-4 h-4 mr-2" />
          Start Multi-Angle Face Scan
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
          <span className="text-sm font-semibold">Multi-Angle Face Mapping Complete</span>
        </div>

        <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Angle coverage</span>
            <span className="text-muted-foreground">{capturedAngles.length}/{SCAN_SEQUENCE.length} captured</span>
          </div>
          <Progress value={coverageProgress} className="h-1.5" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {SCAN_SEQUENCE.map((angle) => {
              const isCaptured = Boolean(capturedData[angle]);
              return (
                <div
                  key={angle}
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                    isCaptured
                      ? 'border-green-300 bg-green-50 text-green-800'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {ANGLE_DETAILS[angle].label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center gap-3">
          {SCAN_SEQUENCE.map((angle) =>
            capturedData[angle] ? (
              <div key={angle} className="text-center">
                <img
                  src={capturedData[angle].image_url}
                  alt={angle}
                  className="w-20 h-20 rounded-lg object-cover border-2 border-green-200"
                />
                <p className="text-[11px] font-semibold text-muted-foreground mt-1">
                  {ANGLE_DETAILS[angle].label}
                </p>
              </div>
            ) : null
          )}
        </div>

        <div className="text-sm text-muted-foreground text-center">
          Enrolling <span className="font-semibold text-foreground">{name}</span> in{' '}
          <span className="font-semibold text-foreground">{classGroup}</span>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          {descriptorCount} angle descriptor{descriptorCount !== 1 ? 's' : ''} will be saved to recognition data.
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
            Step: {currentAngleDetails?.label} ({capturedAngles.length + 1}/{SCAN_SEQUENCE.length})
          </Badge>
          <button onClick={handleReset} className="text-xs text-muted-foreground hover:underline">
            Cancel
          </button>
        </div>
        <Progress value={getStepProgress(currentState)} className="h-1.5" />
        <p className="text-sm text-center font-medium text-foreground">
          {currentAngleDetails?.instruction}
        </p>

        <div className="rounded-lg border border-border bg-secondary/30 p-2 space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-foreground">Angle coverage</span>
            <span className="text-muted-foreground">{capturedAngles.length}/{SCAN_SEQUENCE.length} captured</span>
          </div>
          <Progress value={coverageProgress} className="h-1" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {SCAN_SEQUENCE.map((angle) => {
              const isCaptured = Boolean(capturedData[angle]);
              const isCurrent = currentState === angle;

              return (
                <div
                  key={angle}
                  className={`rounded-md border px-2 py-1.5 text-[10px] ${
                    isCaptured
                      ? 'border-green-300 bg-green-50 text-green-800'
                      : isCurrent
                        ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                        : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  <div className="font-semibold leading-none">{ANGLE_DETAILS[angle].label}</div>
                  <div className="leading-none mt-1 opacity-80">
                    {isCaptured ? 'Captured' : isCurrent ? 'Current' : 'Pending'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
          {liveFaceBox && (
            <div className="absolute inset-0 pointer-events-none" style={{ transform: 'scaleX(-1)' }}>
              <div
                className="absolute border-2 border-green-500 rounded-md bg-green-500/10"
                style={{
                  left: `${clampToUnit(liveFaceBox.x) * 100}%`,
                  top: `${clampToUnit(liveFaceBox.y) * 100}%`,
                  width: `${clampToUnit(liveFaceBox.width) * 100}%`,
                  height: `${clampToUnit(liveFaceBox.height) * 100}%`,
                }}
              />
            </div>
          )}
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
            <p className="text-[10px] text-muted-foreground">Pitch</p>
            <p className="text-lg font-bold font-mono text-primary">
              {telemetry.detected ? telemetry.pitch.toFixed(2) : '—'}
            </p>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground">Target</p>
            <p className="text-[11px] font-mono text-foreground/70">
              {currentAngleDetails?.target}
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
            disabled={currentState !== 'BACK' && !telemetry.detected}
            onClick={handleManualSnap}
          >
            {currentState === 'BACK' ? 'Capture Back Shot' : 'Manual Snap'}
          </Button>
        </div>
      </div>

      {/* Captured angles so far */}
      {Object.keys(capturedData).length > 0 && (
        <div className="flex gap-2 justify-center">
          {SCAN_SEQUENCE.filter((angle) => Boolean(capturedData[angle])).map((angle) => (
            <div key={angle} className="text-center">
              <img
                src={capturedData[angle].image_url}
                alt={angle}
                className="w-12 h-12 rounded-md object-cover border-2 border-green-300"
              />
              <p className="text-[9px] font-semibold text-green-600 mt-0.5">{ANGLE_DETAILS[angle].label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
