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
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-plugin", "colorful-image-sizer");
      styleEl.textContent = `
        div[role="button"]:has(> div[role="img"]),
        div[role="button"]:has([role="img"]),
        div[role="img"],
        [role="img"] {
          max-width: 440px !important;
          align-self: flex-start !important;
          border-radius: 8px !important;
          overflow: hidden !important;
        }

        div[role="img"] img,
        [role="img"] img,
        div[role="button"] img,
        a img,
        [role="link"] img {
          max-width: 100% !important;
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
      img.closest?.('[role="button"]')
    ) {
      return;
    }

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh || nw <= 0 || nh <= 0) {
      return;
    }

    const targetWidth = nw >= 700 ? Math.min(Math.round(nw / 2.5), 440) : Math.min(nw, 440);

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

      if (frame && frame !== document.body) {
        frame.style.setProperty("min-height", "0px", "important");
        frame.style.setProperty("align-items", "flex-start", "important");
        frame.style.setProperty("max-width", "100%", "important");
        frame.style.setProperty("align-self", "flex-start", "important");
      }
    }

    const linkParent = img.closest?.('a, [role="link"]') as HTMLElement | null;
    if (linkParent && linkParent !== document.body) {
      linkParent.style.setProperty("max-width", "100%", "important");
      linkParent.style.setProperty("align-self", "flex-start", "important");
      linkParent.style.setProperty("border-radius", "8px", "important");
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
