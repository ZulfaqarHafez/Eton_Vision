import { useState, useEffect } from 'react';
import * as faceapi from 'face-api.js';

type FaceInput = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export function useFaceDetection() {
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    async function loadModels() {
      const MODEL_URL = '/models';
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error('Face detection model loading failed:', err);
      }
    }
    loadModels();
  }, []);

  const getFullDetection = async (imageElement: FaceInput) => {
    return faceapi
      .detectSingleFace(imageElement)
      .withFaceLandmarks()
      .withFaceDescriptor();
  };

  const getAllDetections = async (imageElement: FaceInput) => {
    return faceapi
      .detectAllFaces(imageElement)
      .withFaceLandmarks()
      .withFaceDescriptors();
  };

  return { modelsLoaded, getFullDetection, getAllDetections };
}
