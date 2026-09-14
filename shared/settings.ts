import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const paletteModeSchema = z.enum(["vivid", "soft", "high_contrast"]);
export type PaletteMode = z.output<typeof paletteModeSchema>;

export const displayModeSchema = z.enum(["folded", "detailed"]);
export type DisplayMode = z.output<typeof displayModeSchema>;

export const activitySettings = defineSettings({
  id: "display",
  scope: "host",
  version: 1,
  schema: z.object({
    palette: paletteModeSchema.default("vivid"),
    displayMode: displayModeSchema.default("folded"),
  }),
});

export const DEFAULT_PALETTE_MODE: PaletteMode = "vivid";
export const DEFAULT_DISPLAY_MODE: DisplayMode = "folded";
