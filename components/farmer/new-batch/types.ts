// Shared client types for the harvest wizard steps.
import type { SerializedMedia } from "@/lib/batches";
import type { CropSlug, Unit } from "@/lib/crops";

export interface DraftFields {
  crop: CropSlug | null;
  quantity: string;
  unit: Unit;
  /** YYYY-MM-DD */
  harvestDate: string;
  price: string;
  notes: string;
  transcript: string;
  inputLanguage: string;
}

/** One upload in progress or finished (photo, video, or extracted frame). */
export interface UploadTile {
  key: string;
  previewUrl: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  kind: "media" | "frame";
  isVideo: boolean;
  media?: SerializedMedia;
}

/** Local YYYY-MM-DD for `daysAgo` days before today. */
export function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
