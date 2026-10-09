"use client";

import { useEffect } from "react";

const EMBED_UNAVAILABLE_MESSAGE = "gym-ai-embed-unavailable";

/** Tells embed.js on the parent page to remove the iframe (blocked origin, etc.). */
export function EmbedUnavailableSignal() {
  useEffect(() => {
    if (window.parent === window) {
      return;
    }
    window.parent.postMessage({ type: EMBED_UNAVAILABLE_MESSAGE }, "*");
  }, []);

  return null;
}
