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
  // Prisma's native engine must stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
