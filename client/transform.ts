import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import type { DisplayMode } from "../shared/settings";
import {
  createReasoningData,
  createToolCallData,
  REASONING_RENDERER_KIND,
  REASONING_RENDERER_VERSION,
  TOOL_CALL_RENDERER_KIND,
  TOOL_CALL_RENDERER_VERSION,
} from "../shared/timeline";
import { clearGroups, markTurnFinished, registerGroupItem } from "./group-store";

type ReasoningTransformer = PluginTimelineTransformerContribution<"reasoning">["transform"];
type ToolCallTransformer = PluginTimelineTransformerContribution<"tool_call">["transform"];

let currentTurnIndex = 0;
let currentTurnKey = "turn_0";
let reasoningCounter = 0;
const itemToTurnKey = new Map<string, string>();
interface TurnLeader {
  id: string;
  type: "reasoning" | "tool_call";
}
const turnLeaders = new Map<string, TurnLeader>();
let currentDisplayMode: DisplayMode = "folded";

export function setDisplayMode(mode: DisplayMode): void {
  currentDisplayMode = mode;
}

export function getDisplayMode(): DisplayMode {
  return currentDisplayMode;
}

export function recordTurnBoundary(boundaryItem?: {
  id?: string;
  messageId?: string;
  clientMessageId?: string;
  text?: string;
}): void {
  currentTurnIndex++;
  const id =
    boundaryItem?.id ??
    boundaryItem?.messageId ??
    boundaryItem?.clientMessageId ??
    `turn_${currentTurnIndex}`;
  currentTurnKey = id;
}

export function markCurrentTurnFinished(timestamp?: number): void {
  markTurnFinished(currentTurnKey, timestamp);
}

export function getCurrentTurnIndex(): number {
  return currentTurnIndex;
}

export function getCurrentTurnKey(): string {
  return currentTurnKey;
}

export function resetTurnIndex(): void {
  currentTurnIndex = 0;
  currentTurnKey = "turn_0";
  reasoningCounter = 0;
  itemToTurnKey.clear();
  turnLeaders.clear();
  clearGroups();
}

export const transformReasoning: ReasoningTransformer = ({ item, phase }) => {
  const rawTs =
    (item as { timestamp?: number | string | Date; createdAt?: number | string | Date }).timestamp ??
    (item as { timestamp?: number | string | Date; createdAt?: number | string | Date }).createdAt;
  const ts =
    typeof rawTs === "number"
      ? rawTs
      : rawTs instanceof Date
        ? rawTs.getTime()
        : typeof rawTs === "string"
          ? new Date(rawTs).getTime()
          : Date.now();

  reasoningCounter++;
  const itemId = `reasoning_${currentTurnIndex}_${reasoningCounter}`;
  const turnKey = itemToTurnKey.get(itemId) ?? currentTurnKey;
  itemToTurnKey.set(itemId, turnKey);

  const data = createReasoningData(item, phase, currentTurnIndex, itemId, turnKey);

  registerGroupItem(turnKey, {
    id: itemId,
    type: "reasoning",
    timestamp: ts,
    reasoningData: data,
  });

  if (!turnLeaders.has(turnKey)) {
    turnLeaders.set(turnKey, { id: itemId, type: "reasoning" });
  }

  const isLeader = turnLeaders.get(turnKey)?.id === itemId;

  if (currentDisplayMode === "folded" && !isLeader) {
    return { items: [] };
  }

  return {
    items: [
      {
        type: "plugin",
        kind: REASONING_RENDERER_KIND,
        version: REASONING_RENDERER_VERSION,
        data,
      },
    ],
  };
};

export const transformToolCall: ToolCallTransformer = ({ item }) => {
  // Paseo renders this exact shape as a SpeakMessage, not an ordinary tool card.
  if (
    item.name === "speak" &&
    item.detail?.type === "unknown" &&
    typeof item.detail.input === "string" &&
    item.detail.input.trim()
  ) {
    return undefined;
  }

  const rawTs =
    (item as { timestamp?: number | string | Date; createdAt?: number | string | Date }).timestamp ??
    (item as { timestamp?: number | string | Date; createdAt?: number | string | Date }).createdAt ??
    (item.metadata as { timestamp?: number | string | Date } | undefined)?.timestamp;
  const ts =
    typeof rawTs === "number"
      ? rawTs
      : rawTs instanceof Date
        ? rawTs.getTime()
        : typeof rawTs === "string"
          ? new Date(rawTs).getTime()
          : Date.now();

  const itemId = item.callId;
  const turnKey = itemToTurnKey.get(itemId) ?? currentTurnKey;
  itemToTurnKey.set(itemId, turnKey);

  const data = createToolCallData(item, currentTurnIndex, itemId, turnKey);

  registerGroupItem(turnKey, {
    id: itemId,
    type: "tool_call",
    timestamp: ts,
    toolCallData: data,
  });

  if (!turnLeaders.has(turnKey)) {
    turnLeaders.set(turnKey, { id: itemId, type: "tool_call" });
  }

  const isLeader = turnLeaders.get(turnKey)?.id === itemId;

  if (currentDisplayMode === "folded" && !isLeader) {
    return { items: [] };
  }

  return {
    items: [
      {
        type: "plugin",
        kind: TOOL_CALL_RENDERER_KIND,
        version: TOOL_CALL_RENDERER_VERSION,
        data,
      },
    ],
  };
};
