import type { ReasoningItemData, ToolCallItemData } from "../shared/timeline";

export interface GroupItemData {
  id: string;
  type: "reasoning" | "tool_call";
  timestamp: number;
  reasoningData?: ReasoningItemData;
  toolCallData?: ToolCallItemData;
}

export interface TurnGroup {
  turnIndex: number;
  agentId?: string;
  leaderId: string;
  items: GroupItemData[];
  hasReasoning: boolean;
  commandCount: number;
  editCount: number;
  readCount: number;
  searchCount: number;
  otherToolCount: number;
  isRunning: boolean;
  isFinished?: boolean;
  hasError: boolean;
  startedAt: number;
  completedAt?: number;
}


export function isFileEditAction(tc: ToolCallItemData): boolean {
  if (tc.detail && typeof tc.detail === "object") {
    const detailType = (tc.detail as { type?: string }).type;
    if (
      detailType === "edit" ||
      detailType === "write" ||
      detailType === "patch" ||
      detailType === "create"
    ) {
      return true;
    }
    if (detailType === "read") {
      return false;
    }
  }

  if (tc.presentation.diffStats) {
    return true;
  }

  const label = tc.presentation.label.toLowerCase();
  if (
    label.includes("write") ||
    label.includes("edit") ||
    label.includes("patch") ||
    label.includes("create")
  ) {
    return true;
  }

  const name = tc.name.toLowerCase();
  if (
    name.includes("write") ||
    name.includes("edit") ||
    name.includes("replace") ||
    name.includes("patch") ||
    name.includes("create")
  ) {
    return true;
  }

  return false;
}

// Global store across components in the client session
const groupsByTurn = new Map<string, TurnGroup>();
const turnListeners = new Map<string, Set<() => void>>();

export function getGroupKey(agentIdOrKey: string, turnIndex?: number): string {
  if (turnIndex !== undefined) {
    return `${agentIdOrKey}:${turnIndex}`;
  }
  return agentIdOrKey;
}

export function subscribeGroup(key: string, listener: () => void): () => void {
  let listeners = turnListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    turnListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      turnListeners.delete(key);
    }
  };
}

let notifyMicrotaskScheduled = false;
const pendingNotifies = new Set<string>();

function flushGroupNotifications(): void {
  notifyMicrotaskScheduled = false;
  const keys = Array.from(pendingNotifies);
  pendingNotifies.clear();
  for (const k of keys) {
    const listeners = turnListeners.get(k);
    if (listeners && listeners.size > 0) {
      for (const l of listeners) {
        l();
      }
    }
  }
}

function notifyGroup(key: string): void {
  const listeners = turnListeners.get(key);
  if (!listeners || listeners.size === 0) {
    return;
  }
  pendingNotifies.add(key);
  if (!notifyMicrotaskScheduled) {
    notifyMicrotaskScheduled = true;
    if (typeof queueMicrotask === "function") {
      queueMicrotask(flushGroupNotifications);
    } else {
      setTimeout(flushGroupNotifications, 0);
    }
  }
}

export function markTurnFinished(key: string, timestamp?: number): void {
  const group = groupsByTurn.get(key);
  if (group) {
    if (group.isFinished && group.completedAt) {
      return;
    }
    group.isFinished = true;
    group.isRunning = false;
    if (timestamp) {
      if (!group.completedAt || timestamp > group.completedAt) {
        group.completedAt = timestamp;
      }
    } else if (!group.completedAt) {
      group.completedAt = Date.now();
    }
    notifyGroup(key);
  }
}

function updateGroupStats(group: TurnGroup): void {
  let hasReasoning = false;
  let commandCount = 0;
  let editCount = 0;
  let readCount = 0;
  let searchCount = 0;
  let otherToolCount = 0;
  let isRunning = false;
  let hasError = false;

  for (const item of group.items) {
    if (item.type === "reasoning") {
      hasReasoning = true;
      if (item.reasoningData?.phase === "streaming") isRunning = true;
    } else if (item.type === "tool_call" && item.toolCallData) {
      const tc = item.toolCallData;
      if (tc.status === "running") isRunning = true;
      if (tc.status === "failed" || tc.errorText) hasError = true;

      const cat = tc.presentation.category;
      if (cat === "shell") {
        commandCount++;
      } else if (cat === "file") {
        if (isFileEditAction(tc)) {
          editCount++;
        } else {
          readCount++;
        }
      } else if (cat === "search") {
        searchCount++;
      } else {
        otherToolCount++;
      }
    }
  }

  group.hasReasoning = hasReasoning;
  group.commandCount = commandCount;
  group.editCount = editCount;
  group.readCount = readCount;
  group.searchCount = searchCount;
  group.otherToolCount = otherToolCount;
  group.isRunning = group.isFinished ? false : isRunning;
  group.hasError = hasError;
}

export function registerGroupItem(
  turnKeyOrAgent: string,
  turnIndexOrItem: number | GroupItemData,
  maybeItem?: GroupItemData
): { isLeader: boolean; groupKey: string } {
  let key: string;
  let item: GroupItemData;
  let turnIndex = 0;
  let agentId: string | undefined;

  if (typeof turnIndexOrItem === "number") {
    agentId = turnKeyOrAgent;
    turnIndex = turnIndexOrItem;
    item = maybeItem!;
    key = getGroupKey(agentId, turnIndex);
  } else {
    key = turnKeyOrAgent;
    item = turnIndexOrItem;
  }

  let group = groupsByTurn.get(key);

  if (!group) {
    group = {
      turnIndex,
      agentId,
      leaderId: item.id,
      items: [item],
      hasReasoning: item.type === "reasoning",
      commandCount: 0,
      editCount: 0,
      readCount: 0,
      searchCount: 0,
      otherToolCount: 0,
      isRunning: false,
      hasError: false,
      startedAt: item.timestamp,
      completedAt: item.timestamp,
    };
    updateGroupStats(group);
    groupsByTurn.set(key, group);
    notifyGroup(key);
    return { isLeader: true, groupKey: key };
  }

  const existingIdx = group.items.findIndex((i) => i.id === item.id);
  if (existingIdx >= 0) {
    const existing = group.items[existingIdx];
    if (
      existing.type === item.type &&
      existing.reasoningData?.phase === item.reasoningData?.phase &&
      existing.reasoningData?.text === item.reasoningData?.text &&
      existing.toolCallData?.status === item.toolCallData?.status
    ) {
      return { isLeader: group.leaderId === item.id, groupKey: key };
    }
    group.items[existingIdx] = item;
  } else {
    group.items.push(item);
  }

  if (item.timestamp < group.startedAt) {
    group.startedAt = item.timestamp;
  }
  if (!group.completedAt || item.timestamp > group.completedAt) {
    group.completedAt = item.timestamp;
  }

  updateGroupStats(group);
  notifyGroup(key);
  return { isLeader: group.leaderId === item.id, groupKey: key };
}

export function clearGroups(): void {
  groupsByTurn.clear();
  turnListeners.clear();
}

export function getTurnGroup(key: string): TurnGroup | undefined {
  return groupsByTurn.get(key);
}

export function formatGroupSummary(group: TurnGroup): string {
  const parts: string[] = [];

  if (group.hasReasoning) {
    parts.push("Thought");
  }
  if (group.commandCount > 0) {
    parts.push(`Ran ${group.commandCount} command${group.commandCount > 1 ? "s" : ""}`);
  }
  if (group.editCount > 0) {
    parts.push(`Edited ${group.editCount} file${group.editCount > 1 ? "s" : ""}`);
  }
  if (group.readCount > 0) {
    parts.push(`Read ${group.readCount} file${group.readCount > 1 ? "s" : ""}`);
  }
  if (group.searchCount > 0) {
    parts.push(`Searched ${group.searchCount} time${group.searchCount > 1 ? "s" : ""}`);
  }
  if (group.otherToolCount > 0) {
    parts.push(`Called ${group.otherToolCount} tool${group.otherToolCount > 1 ? "s" : ""}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Activity";
}
