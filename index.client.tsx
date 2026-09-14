import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ActivitySettings } from "./client/settings";
import { ColorfulReasoning, ColorfulToolCall } from "./client/activity";
import {
  markCurrentTurnFinished,
  recordTurnBoundary,
  setDisplayMode,
  transformReasoning,
  transformToolCall,
} from "./client/transform";
import { setupNaturalImageSizing } from "./client/image-sizer";
import { displayModeSchema } from "./shared/settings";
import {
  REASONING_RENDERER_KIND,
  TOOL_CALL_RENDERER_KIND,
  REASONING_RENDERER_VERSION,
  TOOL_CALL_RENDERER_VERSION,
  reasoningItemDataSchema,
  toolCallItemDataSchema,
} from "./shared/timeline";

export default function contribute(client: PluginClientContext) {
  const cleanupImages = setupNaturalImageSizing();

  client.rpc(settingsRpc("display").read, {}).then((result) => {
    if (result.status === "ready" && result.values && typeof result.values === "object") {
      const dm = Reflect.get(result.values, "displayMode");
      const parsed = displayModeSchema.safeParse(dm);
      if (parsed.success) {
        setDisplayMode(parsed.data);
      }
    }
  }).catch(() => {});

  client.addSettingsScreen({
    id: "display",
    title: "Compact activity",
    icon: "Palette",
    Component: ActivitySettings,
  });
  client.addTimelineTransformer({
    id: "boundary-user",
    query: { itemType: "user_message" },
    transform: ({ item }) => {
      const ts = (item as { timestamp?: number | Date; createdAt?: number | Date }).timestamp ??
        (item as { timestamp?: number | Date; createdAt?: number | Date }).createdAt;
      const numTs = typeof ts === "number" ? ts : ts instanceof Date ? ts.getTime() : undefined;
      markCurrentTurnFinished(numTs);
      recordTurnBoundary(item);
      return undefined;
    },
  });
  client.addTimelineTransformer({
    id: "boundary-assistant",
    query: { itemType: "assistant_message" },
    transform: ({ item }) => {
      const ts = (item as { timestamp?: number | Date; createdAt?: number | Date }).timestamp ??
        (item as { timestamp?: number | Date; createdAt?: number | Date }).createdAt;
      const numTs = typeof ts === "number" ? ts : ts instanceof Date ? ts.getTime() : undefined;
      markCurrentTurnFinished(numTs);
      recordTurnBoundary(item);
      return undefined;
    },
  });
  client.addTimelineTransformer({
    id: "reasoning",
    query: { itemType: "reasoning" },
    transform: transformReasoning,
  });
  client.addTimelineTransformer({
    id: "tool-calls",
    query: { itemType: "tool_call" },
    transform: transformToolCall,
  });
  client.addTimelineRenderer({
    kind: REASONING_RENDERER_KIND,
    version: REASONING_RENDERER_VERSION,
    schema: reasoningItemDataSchema,
    Component: ColorfulReasoning,
  });
  client.addTimelineRenderer({
    kind: TOOL_CALL_RENDERER_KIND,
    version: TOOL_CALL_RENDERER_VERSION,
    schema: toolCallItemDataSchema,
    Component: ColorfulToolCall,
  });
  return () => {
    cleanupImages();
  };
}
