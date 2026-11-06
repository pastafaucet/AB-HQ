import type { NextConfig } from "next";

// Old addresses from before the five-destination nav (2026-11). Permanent,
// so phone bookmarks land in the right place. Query strings pass through.
const MOVED: [string, string][] = [
  ["/my-day", "/plan/today?mode=today"],
  ["/start-up", "/plan/today?mode=start"],
  ["/wind-down", "/plan/today?mode=wind"],
  ["/hub/weekly", "/plan/week"],
  ["/hub/inbox", "/work/inbox"],
  ["/hub/tasks", "/work/tasks"],
  ["/hub/projects", "/work/projects"],
  ["/hub/cases", "/work/cases"],
  ["/hub/time", "/work/time"],
  ["/hub/notes", "/notes"],
  ["/hub/people", "/notes/people"],
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      ...MOVED.map(([source, destination]) => ({ source, destination, permanent: true })),
      // Placeholder hubs no longer exist.
      { source: "/hub/:slug*", destination: "/", permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      // Imported meeting notes carry full transcripts (100 KB+), and the
      // editor autosaves the whole note. Stay under Vercel's 4.5 MB cap.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
