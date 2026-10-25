"use client";

import { MAX_REVIEW_UPLOAD_BYTES } from "@/lib/review-media";

const MAX_IMAGE_DIMENSION = 1600;

/** Resizes and converts an image for upload, keeping its original if WebP isn't supported. */
export async function compressReviewImage(file: File): Promise<File> {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();

    for (const dimension of [MAX_IMAGE_DIMENSION, 1200, 900, 700]) {
      const scale = Math.min(1, dimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser couldn't prepare this image");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.72));
      if (!blob || blob.type !== "image/webp") return file;
      if (blob.size <= MAX_REVIEW_UPLOAD_BYTES / 5) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp", lastModified: file.lastModified });
      }
    }
    return file;
  } finally {
    URL.revokeObjectURL(source);
  }
}
