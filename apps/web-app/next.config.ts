import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: ".next-build-cache",
  turbopack: {
    root: path.join(process.cwd(), "../.."),
  },
};

export default nextConfig;
