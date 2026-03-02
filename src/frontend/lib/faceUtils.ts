export function getFaceCanvas(
  imageElement: HTMLImageElement | HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number }
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const width = Math.abs(box.width);
  const height = Math.abs(box.height);

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(imageElement, box.x, box.y, width, height, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
