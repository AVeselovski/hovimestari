import { THEME_COLORS } from "@/lib/theme/noFlashScript";
import type { MetadataRoute } from "next";

/** The web manifest, served at /manifest.webmanifest. It makes the app installable to a home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hovimestari",
    short_name: "Hovimestari",
    description: "Your food log and planner.",
    // spike/scan-check only: the installed app opens the camera check page.
    start_url: "/scan-check",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.light,
    // One value only: the manifest cannot vary by colour scheme. The light page background, as the light meta.
    theme_color: THEME_COLORS.light,
    lang: "en",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
