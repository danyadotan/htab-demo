import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HTAB — Governed Repair Operations",
    short_name: "HTAB",
    description:
      "Turn repeated operational friction into governed repair packages that can be replayed, approved, and verified.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2ec",
    theme_color: "#16231d",
  };
}


