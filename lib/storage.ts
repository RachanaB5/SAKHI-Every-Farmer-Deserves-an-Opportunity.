// Media storage abstraction. Files are content-addressed by SHA-256 so the
// same bytes are stored once. Drivers:
//   • local  — writes to /public/uploads (dev, self-hosted)
//   • inline — stores small images as data: URLs in the DB (read-only hosts)
// `local` automatically falls back to `inline` when the filesystem is
// read-only (e.g. serverless). Swap in S3/R2/Blob by adding a driver here.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  url: string;
  driver: "local" | "inline";
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
/** Data URLs bloat rows — only small images may be inlined. */
const INLINE_MAX_BYTES = 600_000;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** File extension for a MIME type (defaults to bin). */
export function extFor(mimeType: string): string {
  return EXT[mimeType] ?? "bin";
}

async function saveLocal(bytes: Buffer, sha256: string, mimeType: string): Promise<StoredFile> {
  const dir = path.join(UPLOAD_DIR, sha256.slice(0, 2));
  const name = `${sha256}.${extFor(mimeType)}`;
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, name);
  // Content-addressed: identical bytes already on disk are simply reused.
  await fs.writeFile(target, bytes, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "EEXIST") throw e;
  });
  return { url: `/uploads/${sha256.slice(0, 2)}/${name}`, driver: "local" };
}

function saveInline(bytes: Buffer, mimeType: string): StoredFile {
  if (bytes.length > INLINE_MAX_BYTES) {
    throw new Error("File too large for inline storage on this deployment, use a smaller photo.");
  }
  return { url: `data:${mimeType};base64,${bytes.toString("base64")}`, driver: "inline" };
}

/**
 * Persists a file with the configured driver.
 * @param bytes - raw file contents
 * @param sha256 - precomputed hash (used as the file name)
 * @param mimeType - validated MIME type
 */
export async function saveFile(bytes: Buffer, sha256: string, mimeType: string): Promise<StoredFile> {
  if (process.env.STORAGE_DRIVER === "inline") return saveInline(bytes, mimeType);
  try {
    return await saveLocal(bytes, sha256, mimeType);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") return saveInline(bytes, mimeType);
    throw e;
  }
}

/**
 * Reads a stored file back (for server-side AI checks).
 * @param url - value returned by saveFile (or a /seed path)
 */
export async function readFile(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const rel = url.replace(/^\/+/, "");
  const full = path.join(process.cwd(), "public", rel);
  // Never read outside /public.
  if (!full.startsWith(path.join(process.cwd(), "public"))) throw new Error("Invalid media path");
  return fs.readFile(full);
}
