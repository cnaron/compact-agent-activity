import { afterEach, describe, expect, it, vi } from "vitest";
import { setupNaturalImageSizing } from "./image-sizer";

describe("natural image sizer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error test cleanup
    delete globalThis.document;
    // @ts-expect-error test cleanup
    delete globalThis.HTMLElement;
    // @ts-expect-error test cleanup
    delete globalThis.MutationObserver;
  });

  it("does not throw in non-browser environments and returns cleanup function", () => {
    const cleanup = setupNaturalImageSizing();
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });

  it("safely constrains assistant response images in DOM", async () => {
    class MockElement {
      styleMap = new Map<string, string>();
      attributes = new Map<string, string>();
      parentElement: MockElement | null = null;
      children: MockElement[] = [];
      tagName = "DIV";

      style = {
        setProperty: (k: string, v: string) => {
          this.styleMap.set(k, v);
        },
        getPropertyValue: (k: string) => this.styleMap.get(k) ?? "",
      };

      getAttribute(attr: string) {
        return this.attributes.get(attr) ?? null;
      }

      setAttribute(attr: string, val: string) {
        this.attributes.set(attr, val);
      }

      closest(selector: string) {
        // eslint-disable-next-line typescript-eslint/no-this-alias
        let curr: MockElement | null = this;
        while (curr) {
          if (selector.includes('role="img"') && curr.getAttribute("role") === "img") {
            return curr;
          }
          if (selector.includes("avatar") && curr.getAttribute("data-testid")?.includes("avatar")) {
            return curr;
          }
          curr = curr.parentElement;
        }
        return null;
      }
    }

    class MockImageElement extends MockElement {
      override tagName = "IMG";
      naturalWidth = 240;
      naturalHeight = 120;
      complete = true;
      addEventListener() {}
    }

    // Build hierarchy: imageFrame -> imageSurface (role="img") -> rnImageRoot -> img
    const imageFrame = new MockElement();
    imageFrame.style.setProperty("min-height", "160px");

    const imageSurface = new MockElement();
    imageSurface.setAttribute("role", "img");
    imageSurface.parentElement = imageFrame;
    imageFrame.children.push(imageSurface);

    const rnImageRoot = new MockElement();
    rnImageRoot.parentElement = imageSurface;
    imageSurface.children.push(rnImageRoot);

    const img = new MockImageElement();
    img.parentElement = rnImageRoot;
    rnImageRoot.children.push(img);

    const mockBody = new MockElement();
    const disconnectSpy = vi.fn();

    class MockMutationObserver {
      observe() {}
      disconnect = disconnectSpy;
    }

    const mockDocument = {
      body: mockBody,
      querySelectorAll: vi.fn((sel: string) => {
        if (sel.includes("img")) return [img];
        return [];
      }),
    };

    // @ts-expect-error mock injection
    globalThis.document = mockDocument;
    // @ts-expect-error mock injection
    globalThis.HTMLElement = MockElement;
    // @ts-expect-error mock injection
    globalThis.MutationObserver = MockMutationObserver;

    const cleanup = setupNaturalImageSizing();
    await new Promise((r) => setTimeout(r, 20));

    // Check imageSurface has real width, aspect-ratio, max-width and align-self
    expect(imageSurface.styleMap.get("width")).toBe("240px");
    expect(imageSurface.styleMap.get("max-width")).toBe("100%");
    expect(imageSurface.styleMap.get("aspect-ratio")).toBe("240 / 120");
    expect(imageSurface.styleMap.get("height")).toBe("auto");
    expect(imageSurface.styleMap.get("align-self")).toBe("flex-start");
    expect(imageSurface.styleMap.get("margin-top")).toBe("0px");
    expect(imageSurface.styleMap.get("margin-bottom")).toBe("0px");

    // Check imageFrame min-height and margins reset to 0px
    expect(imageFrame.styleMap.get("min-height")).toBe("0px");
    expect(imageFrame.styleMap.get("align-items")).toBe("flex-start");
    expect(imageFrame.styleMap.get("margin-top")).toBe("0px");
    expect(imageFrame.styleMap.get("margin-bottom")).toBe("0px");

    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it("does not force thumbnail sizing on images inside the fullscreen lightbox", async () => {
    class MockElement {
      styleMap = new Map<string, string>();
      attributes = new Map<string, string>();
      parentElement: MockElement | null = null;
      children: MockElement[] = [];
      tagName = "DIV";

      style = {
        setProperty: (k: string, v: string) => {
          this.styleMap.set(k, v);
        },
        getPropertyValue: (k: string) => this.styleMap.get(k) ?? "",
      };

      getAttribute(attr: string) {
        return this.attributes.get(attr) ?? null;
      }

      setAttribute(attr: string, val: string) {
        this.attributes.set(attr, val);
      }

      closest(selector: string) {
        // eslint-disable-next-line typescript-eslint/no-this-alias
        let curr: MockElement | null = this;
        while (curr) {
          if (
            selector.includes("attachment-lightbox") &&
            curr.getAttribute("data-testid") === "attachment-lightbox"
          ) {
            return curr;
          }
          curr = curr.parentElement;
        }
        return null;
      }
    }

    class MockImageElement extends MockElement {
      override tagName = "IMG";
      naturalWidth = 1200;
      naturalHeight = 2600;
      complete = true;
      addEventListener() {}
    }

    const lightbox = new MockElement();
    lightbox.setAttribute("data-testid", "attachment-lightbox");

    const imageSurface = new MockElement();
    imageSurface.setAttribute("role", "img");
    imageSurface.parentElement = lightbox;
    lightbox.children.push(imageSurface);

    const img = new MockImageElement();
    img.parentElement = imageSurface;
    imageSurface.children.push(img);

    const mockDocument = {
      body: new MockElement(),
      querySelectorAll: vi.fn((sel: string) => (sel.includes("img") ? [img] : [])),
    };

    // @ts-expect-error mock injection
    globalThis.document = mockDocument;
    // @ts-expect-error mock injection
    globalThis.HTMLElement = MockElement;

    const cleanup = setupNaturalImageSizing();
    await new Promise((r) => setTimeout(r, 20));

    // The lightbox's fullscreen preview must be left untouched by the thumbnail sizer.
    expect(imageSurface.styleMap.size).toBe(0);
    expect(img.styleMap.size).toBe(0);

    cleanup();
  });

  it("caps tall portrait screenshots by height, not just width", async () => {
    class MockElement {
      styleMap = new Map<string, string>();
      attributes = new Map<string, string>();
      parentElement: MockElement | null = null;
      children: MockElement[] = [];
      tagName = "DIV";

      style = {
        setProperty: (k: string, v: string) => {
          this.styleMap.set(k, v);
        },
        getPropertyValue: (k: string) => this.styleMap.get(k) ?? "",
      };

      getAttribute(attr: string) {
        return this.attributes.get(attr) ?? null;
      }

      setAttribute(attr: string, val: string) {
        this.attributes.set(attr, val);
      }

      closest(selector: string) {
        // eslint-disable-next-line typescript-eslint/no-this-alias
        let curr: MockElement | null = this;
        while (curr) {
          if (selector.includes('role="img"') && curr.getAttribute("role") === "img") {
            return curr;
          }
          if (selector.includes("avatar") && curr.getAttribute("data-testid")?.includes("avatar")) {
            return curr;
          }
          curr = curr.parentElement;
        }
        return null;
      }
    }

    class MockImageElement extends MockElement {
      override tagName = "IMG";
      // Full-height phone screenshot: narrow width, very tall.
      naturalWidth = 390;
      naturalHeight = 844;
      complete = true;
      addEventListener() {}
    }

    const imageFrame = new MockElement();
    const imageSurface = new MockElement();
    imageSurface.setAttribute("role", "img");
    imageSurface.parentElement = imageFrame;
    imageFrame.children.push(imageSurface);

    const img = new MockImageElement();
    img.parentElement = imageSurface;
    imageSurface.children.push(img);

    const mockDocument = {
      body: new MockElement(),
      querySelectorAll: vi.fn((sel: string) => (sel.includes("img") ? [img] : [])),
    };

    // @ts-expect-error mock injection
    globalThis.document = mockDocument;
    // @ts-expect-error mock injection
    globalThis.HTMLElement = MockElement;

    const cleanup = setupNaturalImageSizing();
    await new Promise((r) => setTimeout(r, 20));

    // Width must shrink well below the 440px cap so height stays within 320px.
    const width = Number(imageSurface.styleMap.get("width")?.replace("px", ""));
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(390);
    const impliedHeight = width * (844 / 390);
    expect(impliedHeight).toBeLessThanOrEqual(320.5);

    cleanup();
  });

  it("injects declarative style tag with compact folded activity and image rules", () => {
    class MockStyleElement {
      attributes = new Map<string, string>();
      textContent = "";
      setAttribute(attr: string, val: string) {
        this.attributes.set(attr, val);
      }
      getAttribute(attr: string) {
        return this.attributes.get(attr) ?? null;
      }
    }

    const appendedElements: MockStyleElement[] = [];
    const mockHead = {
      appendChild: (el: MockStyleElement) => {
        appendedElements.push(el);
      },
    };

    const mockDocument = {
      head: mockHead,
      createElement: (tag: string) => {
        if (tag === "style") return new MockStyleElement();
        return {};
      },
      querySelectorAll: () => [],
    };

    // @ts-expect-error mock injection
    globalThis.document = mockDocument;

    const cleanup = setupNaturalImageSizing();
    expect(appendedElements.length).toBe(1);
    expect(appendedElements[0].getAttribute("data-plugin")).toBe("colorful-image-sizer");
    expect(appendedElements[0].textContent).toContain("data-folded-wrapper");
    expect(appendedElements[0].textContent).toContain("folded-activity-group");
    expect(appendedElements[0].textContent).toContain("margin-bottom: 3px !important");
    expect(appendedElements[0].textContent).toContain(':has(> [role="img"])');
    expect(appendedElements[0].textContent).toContain('[role="button"]:has([role="img"])');
    expect(appendedElements[0].textContent).toContain(':not([data-testid="attachment-lightbox"] *)');
    expect(appendedElements[0].textContent).toContain(':not([role="dialog"] *)');

    cleanup();
  });
});

