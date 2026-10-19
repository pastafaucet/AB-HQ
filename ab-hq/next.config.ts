import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Imported meeting notes carry full transcripts (100 KB+), and the
      // editor autosaves the whole note. Stay under Vercel's 4.5 MB cap.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
