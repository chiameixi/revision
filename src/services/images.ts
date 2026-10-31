// Converting between files, Blobs and data URLs. Works in the browser and in
// Node tests (no FileReader; uses arrayBuffer + btoa).

import type { NewImage } from "@/db";

export async function blobToDataUrl(blob: Blob, mimeType = blob.type || "image/png"): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function dataUrlToImage(dataUrl: string): NewImage {
  const [header, base64 = ""] = dataUrl.split(",", 2);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

// Browser only: reads an uploaded file and its pixel size.
export async function fileToImage(file: File | Blob): Promise<NewImage> {
  const mimeType = file.type || "image/png";
  try {
    const bitmap = await createImageBitmap(file);
    const image = { blob: file, mimeType, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return image;
  } catch {
    return { blob: file, mimeType };
  }
}
