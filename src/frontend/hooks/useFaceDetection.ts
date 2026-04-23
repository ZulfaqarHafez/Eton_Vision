import { useState, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { FilesetResolver, ImageEmbedder } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';

type FaceInput = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export interface YoloDetection {
  descriptor: Float32Array;
  mediaPipeDescriptor: Float32Array;
  detection: {
    box: { x: number; y: number; width: number; height: number };
    score: number;
  };
}

export function useFaceDetection() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [yoloSession, setYoloSession] = useState<ort.InferenceSession | null>(null);
  const [mediaPipeEmbedder, setMediaPipeEmbedder] = useState<ImageEmbedder | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        
        // Load the new MediaPipe WebAssembly files
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const embedder = await ImageEmbedder.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite"
          },
          quantize: false
        });

        // Load your YOLOv8 model AND the old face-api models concurrently!
        const [session] = await Promise.all([
          ort.InferenceSession.create('/models/yolov8_web_ready.onnx'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);

        if (!cancelled) {
          setYoloSession(session);
          setMediaPipeEmbedder(embedder); // Save the new detective
          setModelsLoaded(true);
        }
      } catch (err) {
        console.error('Face detection model loading failed:', err);
      }
    }
    loadModels();
    return () => { cancelled = true; };
  }, []);

  const prepareImageTensor = (imageElement: any, origW: number, origH: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d')!;

    const scale = Math.min(640 / origW, 640 / origH);
    const newW = origW * scale;
    const newH = origH * scale;
    const padX = (640 - newW) / 2;
    const padY = (640 - newH) / 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 640, 640);
    ctx.drawImage(imageElement, 0, 0, origW, origH, padX, padY, newW, newH);
    
    const imgData = ctx.getImageData(0, 0, 640, 640).data;
    const float32Data = new Float32Array(3 * 640 * 640);
    for (let i = 0; i < 640 * 640; i++) {
      float32Data[i] = imgData[i * 4] / 255.0;
      float32Data[i + 640 * 640] = imgData[i * 4 + 1] / 255.0;
      float32Data[i + 2 * 640 * 640] = imgData[i * 4 + 2] / 255.0;
    }
    return new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
  };

  const calculateOverlap = (box1: any, box2: any) => {
    const xA = Math.max(box1.x, box2.x);
    const yA = Math.max(box1.y, box2.y);
    const xB = Math.min(box1.x + box1.width, box2.x + box2.width);
    const yB = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;

    // Standard overlap
    const iou = interArea / (box1Area + box2Area - interArea);
    
    // 🛠️ NEW: How much of the smaller box is inside the bigger one?
    const minArea = Math.min(box1Area, box2Area);
    const insideRatio = interArea / minArea; 

    return { iou, insideRatio };
  };

  const getAllDetections = useCallback(async (imageElement: any): Promise<YoloDetection[]> => {
    if (!yoloSession) return [];

    const origW = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width;
    const origH = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height;
    
    const tensor = prepareImageTensor(imageElement, origW, origH);
    const results = await yoloSession.run({ images: tensor });
    const output = results.output0.data as Float32Array;

    const scale = Math.min(640 / origW, 640 / origH);
    const padX = (640 - (origW * scale)) / 2;
    const padY = (640 - (origH * scale)) / 2;

    const rawBoxes = [];

    for (let i = 0; i < 8400; i++) {
      const confidence = output[4 * 8400 + i];
      
      // 🛠️ Bumped the confidence slightly to filter out the noise!
      if (confidence > 0.32) { 
        const xc = output[0 * 8400 + i];
        const yc = output[1 * 8400 + i];
        const w = output[2 * 8400 + i];
        const h = output[3 * 8400 + i];

        // 🛠️ THE TIGHTENED GEOMETRY FILTER
        // A human head is roughly square. We instantly reject boxes that are too skinny or too wide!
        const aspectRatio = w / h;
        if (aspectRatio < 0.5 || aspectRatio > 1.4) {
            continue; // Skip this box, it is definitely a hand or an arm!
        }

        const unpaddedXc = (xc - padX) / scale;
        const unpaddedYc = (yc - padY) / scale;
        const unpaddedW = w / scale;
        const unpaddedH = h / scale;

        rawBoxes.push({
          x: unpaddedXc - unpaddedW / 2,
          y: unpaddedYc - unpaddedH / 2,
          width: unpaddedW,
          height: unpaddedH,
          score: confidence
        });
      }
    }

    // 🛠️ THE RUSSIAN DOLL FIX: Sort by area (smallest first) instead of confidence score!
    // This ensures the crisp, small face boxes are always prioritised over the massive body boxes.
    rawBoxes.sort((a, b) => (a.width * a.height) - (b.width * b.height));

    const finalBoxes = [];
    for (const box of rawBoxes) {
      let keep = true;
      for (const selectedBox of finalBoxes) {
        
        // 🚨 Notice we are calling the new 'calculateOverlap' here!
        const { iou, insideRatio } = calculateOverlap(box, selectedBox);
        
        // If they overlap normally, OR if this box completely swallows a smaller face box, discard it!
        if (iou > 0.45 || insideRatio > 0.8) { 
          keep = false; 
          break; 
        }
      }
      if (keep) finalBoxes.push(box);
    }

    const finalDetections: YoloDetection[] = [];
    for (const box of finalBoxes) {
       const faceCanvas = document.createElement('canvas');
       
       const bx = Math.max(0, Math.min(box.x, origW - 1));
       const by = Math.max(0, Math.min(box.y, origH - 1));
       const bw = Math.max(1, Math.min(box.width, origW - bx));
       const bh = Math.max(1, Math.min(box.height, origH - by));

       faceCanvas.width = bw;
       faceCanvas.height = bh;
       const ctx = faceCanvas.getContext('2d')!;
       ctx.drawImage(imageElement, bx, by, bw, bh, 0, 0, bw, bh);

       let oldDescriptor = new Float32Array(128); 
       let newDescriptor = new Float32Array(1024);
       
       try {
          // 🕵️‍♂️ Detective 1 (The Old Guard - face-api.js)
          const rawDescriptor = await faceapi.computeFaceDescriptor(faceCanvas);
          if (rawDescriptor) {
          const validDescriptor = Array.isArray(rawDescriptor) || rawDescriptor instanceof Array ? rawDescriptor[0] : rawDescriptor;
               oldDescriptor = new Float32Array(validDescriptor);
          }

          // 🕵️‍♂️ Detective 2 (The New Recruit - MediaPipe)
          if (mediaPipeEmbedder) {
              const embeddingResult = mediaPipeEmbedder.embed(faceCanvas);
              if (embeddingResult.embeddings.length > 0) {
              newDescriptor = new Float32Array(embeddingResult.embeddings[0].floatEmbedding);
              }
            }
       } catch (error) {
          console.warn("One of the detectives struggled with this face!", error);
       }

       finalDetections.push({
           detection: { box, score: box.score },
           descriptor: oldDescriptor,          // The original 128-number signature
           mediaPipeDescriptor: newDescriptor  // The brilliant new 1024-number signature!
       });
    }
    return finalDetections;
  }, [yoloSession]);

  const getFullDetection = useCallback(async (imageElement: FaceInput) => {
    const allFaces = await getAllDetections(imageElement);
    return allFaces.length > 0 ? allFaces[0] : null;
  }, [getAllDetections]);

  return { modelsLoaded, getFullDetection, getAllDetections };
}