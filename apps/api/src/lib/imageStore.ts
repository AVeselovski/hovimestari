import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_IMAGES_DIR = "/data/images";

export function resolveImagesDir(): string {
  const dir = process.env.IMAGES_DIR?.trim();
  return dir && dir.length > 0 ? dir : DEFAULT_IMAGES_DIR;
}

export async function ensureImagesDir(): Promise<string> {
  const dir = resolveImagesDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

// Stored files are always re-encoded to JPEG client-side, so a fixed .jpg
// extension keeps the served content-type predictable.
export async function writeImage(buffer: Buffer): Promise<string> {
  const dir = await ensureImagesDir();
  const imageId = `${randomUUID()}.jpg`;
  await writeFile(path.join(dir, imageId), buffer);
  return imageId;
}

// Matches the fixed .jpg scheme above. Stored ids are always UUID + ".jpg",
// so the served-filename guard accepts only that shape.
export const IMAGE_FILENAME_PATTERN = /^[a-f0-9-]+\.jpg$/;
