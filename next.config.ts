// Next.js configuration for FoodFlow.
// Cache Components is left off: almost every screen is per-user, live data
// (orders, inventory, deliveries), so classic dynamic rendering is simpler.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root; a stray lockfile higher up confuses detection.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Seed photos, brand photography (/photos) and user uploads are served from /public.
    localPatterns: [{ pathname: "/seed/**" }, { pathname: "/uploads/**" }, { pathname: "/photos/**" }],
  },
  // Prisma's engine and the ONNX runtime (Sakhi's Kannada and Hindi voices) are
  // native modules and stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "onnxruntime-node"],
  // The Kannada and Hindi voice models (models/, built locally) and the ONNX runtime's
  // binaries for every platform are far too large for a serverless function;
  // deployed builds answer /api/tts with 503 and the browser voice is used.
  outputFileTracingExcludes: { "/api/tts": ["models/**", "node_modules/onnxruntime-node/**"] },
};

export default nextConfig;
