export const MAX_DIMENSION = 2000;
export const JPEG_QUALITY = 0.85;
export const MAX_BYTES = 5 * 1024 * 1024;

export class ImageTooLargeError extends Error {
  constructor(message = "image exceeds 5 MB after preprocessing") {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

export function scaleToFit(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function preprocessImage(
  file: File,
): Promise<{ blob: Blob; dataUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width, height } = scaleToFit(
      img.naturalWidth,
      img.naturalHeight,
      MAX_DIMENSION,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("canvas 2d context unavailable");
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b === null) reject(new Error("canvas.toBlob returned null"));
          else resolve(b);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    if (blob.size > MAX_BYTES) {
      throw new ImageTooLargeError();
    }
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") resolve(r);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
