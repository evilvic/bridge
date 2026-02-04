import { ConvexHttpClient } from "convex/browser";

const url = import.meta.env.VITE_CONVEX_URL;

if (!url) {
  console.warn("VITE_CONVEX_URL is not set");
}

export const convexClient = new ConvexHttpClient(url ?? "");
