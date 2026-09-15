/**
 * Natural image sizing for assistant response images.
 * Uses declarative CSS constraints to prevent images from stretching to 100% full width,
 * while preserving natural aspect ratio and rounded card styling.
 * Zero MutationObserver on document.body, zero layout shifts, zero scroll jitter.
 */
export function setupNaturalImageSizing(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const head = document.head || document.body;
  let styleEl: HTMLElement | null = null;
  if (head && typeof document.createElement === "function") {
    try {
      // Defensively drop any stale tag left behind by a prior load whose
      // cleanup didn't run, so cascade order never depends on leftover copies.
      if (typeof document.querySelectorAll === "function") {
        document.querySelectorAll('style[data-plugin="colorful-image-sizer"]').forEach((el) => {
          el.parentNode?.removeChild(el);
        });
      }
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-plugin", "colorful-image-sizer");
      // Every thumbnail-compaction selector excludes descendants of the
      // fullscreen attachment lightbox, so the compact box (max-height,
      // min-height:0, flex-start alignment) never reaches the viewer that
      // relies on those same properties to center and size the full image.
      const NOT_LIGHTBOX = ':not([role="dialog"] *):not([data-testid="attachment-lightbox"] *)';
      styleEl.textContent = `
        [role="button"]:has(> div[role="img"])${NOT_LIGHTBOX},
        [role="button"]:has([role="img"])${NOT_LIGHTBOX},
        div[role="img"]${NOT_LIGHTBOX},
        [role="img"]${NOT_LIGHTBOX} {
          max-width: 440px !important;
          max-height: 320px !important;
          margin-top: 0px !important;
          margin-bottom: 0px !important;
          margin-left: 0px !important;
          margin-right: auto !important;
          align-self: flex-start !important;
          border-radius: 8px !important;
          overflow: hidden !important;
        }

        :has(> [role="img"])${NOT_LIGHTBOX} {
          min-height: 0px !important;
          margin-top: 0px !important;
          margin-bottom: 0px !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
        }

        :has(> [role="button"]:has([role="img"]))${NOT_LIGHTBOX} {
          align-items: flex-start !important;
          justify-content: flex-start !important;
        }

        div[role="img"] img${NOT_LIGHTBOX},
        [role="img"] img${NOT_LIGHTBOX},
        [role="button"] img${NOT_LIGHTBOX},
        a img${NOT_LIGHTBOX},
        [role="link"] img${NOT_LIGHTBOX} {
          max-width: 100% !important;
          max-height: 320px !important;
          width: auto !important;
          height: auto !important;
          border-radius: 8px !important;
          object-fit: contain !important;
        }

        /* Compact line spacing for folded activity groups */
        div[data-folded-wrapper="true"] {
          margin-top: -6px !important;
          margin-bottom: 3px !important;
        }

        div[data-folded-wrapper="true"] + div[data-folded-wrapper="true"] {
          margin-top: 0px !important;
        }

        div:has(> [data-testid="folded-activity-group"]:not([data-expanded="true"])) {
          margin-top: -6px !important;
          margin-bottom: 3px !important;
        }

        div:has(> [data-testid="folded-activity-group"]:not([data-expanded="true"])) + div:has(> [data-testid="folded-activity-group"]:not([data-expanded="true"])) {
          margin-top: 0px !important;
        }
      `;
      head.appendChild(styleEl);
    } catch {
      // Ignore if DOM doesn't support style creation
    }
  }

  const applyImageSizing = (img: HTMLImageElement) => {
    if (
      img.closest?.('[data-testid*="avatar"]') ||
      img.closest?.('[aria-label*="avatar"]') ||
      img.closest?.('[role="button"]') ||
      img.closest?.('[data-testid="attachment-lightbox"]') ||
      img.closest?.('[role="dialog"]')
    ) {
      return;
    }

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh || nw <= 0 || nh <= 0) {
      return;
    }

    // Fit within a bounding box on both axes so tall portrait screenshots
    // (e.g. full-height phone captures) don't render at near-natural height
    // and blow out the compact activity feed's vertical rhythm.
    const MAX_WIDTH = 440;
    const MAX_HEIGHT = 320;
    const scale = Math.min(MAX_WIDTH / nw, MAX_HEIGHT / nh, 1);
    const targetWidth = Math.max(1, Math.round(nw * scale));

    let surface: HTMLElement | null = null;
    let frame: HTMLElement | null = null;

    if (img.parentElement?.parentElement?.getAttribute("role") === "img") {
      surface = img.parentElement.parentElement as HTMLElement;
      frame = surface.parentElement as HTMLElement;
    } else if (img.parentElement?.getAttribute("role") === "img") {
      surface = img.parentElement as HTMLElement;
      frame = surface.parentElement as HTMLElement;
    } else if (img.parentElement && img.parentElement !== document.body) {
      surface = img.parentElement as HTMLElement;
      frame = surface.parentElement as HTMLElement;
    }

    if (surface && surface !== document.body) {
      surface.style.setProperty("width", `${targetWidth}px`, "important");
      surface.style.setProperty("max-width", "100%", "important");
      surface.style.setProperty("aspect-ratio", `${nw} / ${nh}`, "important");
      surface.style.setProperty("height", "auto", "important");
      surface.style.setProperty("border-radius", "8px", "important");
      surface.style.setProperty("overflow", "hidden", "important");
      surface.style.setProperty("align-self", "flex-start", "important");
      surface.style.setProperty("margin-top", "0px", "important");
      surface.style.setProperty("margin-bottom", "0px", "important");
      surface.style.setProperty("margin-left", "0px", "important");
      surface.style.setProperty("margin-right", "auto", "important");

      if (frame && frame !== document.body) {
        frame.style.setProperty("min-height", "0px", "important");
        frame.style.setProperty("align-items", "flex-start", "important");
        frame.style.setProperty("max-width", "100%", "important");
        frame.style.setProperty("align-self", "flex-start", "important");
        frame.style.setProperty("margin-top", "0px", "important");
        frame.style.setProperty("margin-bottom", "0px", "important");
        frame.style.setProperty("margin-left", "0px", "important");
        frame.style.setProperty("margin-right", "auto", "important");

        const outer = frame.parentElement;
        if (outer && outer !== document.body) {
          outer.style.setProperty("align-items", "flex-start", "important");
          outer.style.setProperty("justify-content", "flex-start", "important");
        }
      }
    }

    const linkParent = img.closest?.('a, [role="link"]') as HTMLElement | null;
    if (linkParent && linkParent !== document.body) {
      linkParent.style.setProperty("max-width", "100%", "important");
      linkParent.style.setProperty("align-self", "flex-start", "important");
      linkParent.style.setProperty("border-radius", "8px", "important");
      linkParent.style.setProperty("margin-top", "0px", "important");
      linkParent.style.setProperty("margin-bottom", "0px", "important");
    }

    img.style.setProperty("width", "100%", "important");
    img.style.setProperty("max-width", "100%", "important");
    img.style.setProperty("height", "auto", "important");
    img.style.setProperty("border-radius", "8px", "important");
  };

  try {
    if (typeof document.querySelectorAll === "function") {
      document.querySelectorAll<HTMLImageElement>('div[role="img"] img, img').forEach(applyImageSizing);
    }
  } catch {
    // Ignore query error in mock environments
  }

  return () => {
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  };
}
