// Client-side frame extraction: seeks a recorded harvest video to a few
// points and grabs JPEG stills with a canvas, so the visual check can run
// on frames without uploading/decoding video server-side.
"use client";

/** Resolves on the first `event` from `el`, rejects after `ms`. */
function once(el: HTMLMediaElement, event: string, ms = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      el.removeEventListener(event, done);
      reject(new Error(`Video ${event} timed out`));
    }, ms);
    function done() {
      clearTimeout(timer);
      el.removeEventListener(event, done);
      resolve();
    }
    el.addEventListener(event, done);
  });
}

/**
 * Extracts `count` evenly spaced frames (skipping the very start/end).
 * @param file - video file from <input capture>
 * @param maxSide - longest edge of output frames in px
 * @returns JPEG files named frame-1.jpg …
 */
export async function extractFrames(file: File, count = 3, maxSide = 1024): Promise<File[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 2;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width) throw new Error("Could not read this video");

    const frames: File[] = [];
    for (let i = 0; i < count; i++) {
      // 20% / 50% / 80% of the clip — avoids black first frames and shaky endings.
      const t = duration * ((i + 1) / (count + 1));
      video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
      await once(video, "seeked");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
      if (blob) frames.push(new File([blob], `frame-${i + 1}.jpg`, { type: "image/jpeg" }));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
