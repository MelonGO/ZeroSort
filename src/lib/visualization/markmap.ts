/**
 * Markmap utilities for transforming markdown to mindmap data.
 * Uses markmap-lib for transformation and markmap-view for rendering.
 */
import "@/styles/markmap-highlight.css";
import "katex/dist/katex.min.css";

import { Transformer } from "markmap-lib";

export const transformer = new Transformer();

let areMarkmapAssetsLoaded = false;

/**
 * Ensures markmap relies only on locally bundled assets.
 */
export function ensureMarkmapAssetsLoaded(): void {
  if (areMarkmapAssetsLoaded) {
    return;
  }

  // CSS assets are bundled via static imports above. We intentionally do not
  // load markmap's remote webfontloader or other CDN-hosted assets here.
  areMarkmapAssetsLoaded = true;
}
