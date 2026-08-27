import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In the monorepo, Turbopack can misdetect the workspace root (which breaks routing entirely —
  // every route 404s). Pin it to this app's directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
