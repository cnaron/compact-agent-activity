import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  resetTurnIndex,
  setDisplayMode,
  transformReasoning,
  transformToolCall,
} from "./transform";
import { getTurnGroup } from "./group-store";

function toolCall(detail: ToolCallDetail, status: "running" | "completed" = "completed", callId = "call-1") {
  return {
    type: "tool_call" as const,
    callId,
    name: "edit",
    detail,
    status,
    error: null,
  };
}

describe("colorful activity timeline transforms", () => {
  beforeEach(() => {
    resetTurnIndex();
    setDisplayMode("folded");
  });

  it("replaces reasoning while preserving the streaming phase", () => {
    expect(
      transformReasoning({
        item: { type: "reasoning", text: "**Plan****Result**" },
        phase: "streaming",
      }),
    ).toEqual({
      items: [
        {
          type: "plugin",
          kind: "colorful-reasoning",
          version: 1,
          data: {
            callId: "reasoning_0_1",
            turnIndex: 0,
            turnId: "turn_0",
            text: "**Plan**\n\n**Result**",
            phase: "streaming",
          },
        },
      ],
    });
  });

  it("projects edit presentation, file icon, and diff stats as leader", () => {
    const result = transformToolCall({
      phase: "complete",
      item: toolCall({
        type: "edit",
        filePath: "src/web/main.tsx",
        oldString: "const oldValue = 1;\n",
        newString: "const newValue = 2;\n",
      }),
    });
    expect(result).toEqual({
      items: [
        {
          type: "plugin",
          kind: "colorful-tool-call",
          version: 1,
          data: {
            callId: "call-1",
            turnIndex: 0,
            turnId: "turn_0",
            name: "edit",
            status: "completed",
            detail: {
              type: "edit",
              filePath: "src/web/main.tsx",
              oldString: "const oldValue = 1;\n",
              newString: "const newValue = 2;\n",
            },
            presentation: {
              category: "file",
              icon: "FileCode2",
              label: "Edit File",
              summary: "src/web/main.tsx",
              filePath: "src/web/main.tsx",
              fileIcon: "FileCode2",
              language: "typescript",
              diffStats: { additions: 1, deletions: 1 },
            },
          },
        },
      ],
    });
  });

  it("projects running shell calls with a stable generic fallback", () => {
    const result = transformToolCall({
      phase: "streaming",
      item: {
        ...toolCall(
          { type: "shell", command: "bun test", output: "170 pass" },
          "running",
        ),
        name: "run",
      },
    });
    expect(result?.items[0]?.data).toMatchObject({
      name: "run",
      status: "running",
      presentation: {
        category: "shell",
        icon: "SquareTerminal",
        label: "Shell Command",
        summary: "bun test",
      },
    });
  });

  it("preserves native speak tool calls with text input", () => {
    const result = transformToolCall({
      phase: "complete",
      item: {
        type: "tool_call",
        callId: "speak-1",
        name: "speak",
        detail: { type: "unknown", input: "Hello, I am ready.", output: null },
        status: "completed",
        error: null,
      },
    });
    expect(result).toBeUndefined();
  });

  it("in folded mode, single leader per turn returns items while all followers return empty items array", () => {
    // 1. Turn with reasoning and tool calls: leader reasoning returns folded item
    const r1 = transformReasoning({
      item: { type: "reasoning", text: "Planning next steps..." },
      phase: "complete",
    });
    expect(r1?.items).toHaveLength(1);
    expect(r1?.items[0]?.kind).toBe("colorful-reasoning");

    // Follower reasoning in the same turn returns empty items
    const r2 = transformReasoning({
      item: { type: "reasoning", text: "Refining plan..." },
      phase: "complete",
    });
    expect(r2).toEqual({ items: [] });

    // Subsequent tool calls in the same turn also return empty items (unified turn leader)
    const t1 = transformToolCall({
      phase: "complete",
      item: {
        ...toolCall({ type: "shell", command: "git status", output: "" }, "completed", "call-shell-1"),
        name: "shell",
      },
    });
    expect(t1).toEqual({ items: [] });

    const t2 = transformToolCall({
      phase: "complete",
      item: {
        ...toolCall({ type: "shell", command: "git diff", output: "" }, "completed", "call-shell-2"),
        name: "shell",
      },
    });
    expect(t2).toEqual({ items: [] });

    // All items are registered in the turn group store
    const group0 = getTurnGroup("turn_0");
    expect(group0).toBeDefined();
    expect(group0?.hasReasoning).toBe(true);
    expect(group0?.commandCount).toBe(2);
    expect(group0?.items).toHaveLength(4); // 2 reasoning + 2 commands

    // 2. Turn without reasoning (e.g. Turn 1 in Figure 1): first tool call is the leader
    resetTurnIndex();
    const tLeader = transformToolCall({
      phase: "complete",
      item: {
        ...toolCall({ type: "shell", command: "ls", output: "" }, "completed", "call-ls"),
        name: "shell",
      },
    });
    expect(tLeader?.items).toHaveLength(1);
    expect(tLeader?.items[0]?.kind).toBe("colorful-tool-call");

    const tFollower = transformToolCall({
      phase: "complete",
      item: {
        ...toolCall({ type: "read", filePath: "readme.md" }, "completed", "call-read"),
        name: "read",
      },
    });
    expect(tFollower).toEqual({ items: [] });
  });

  it("in detailed mode, all tool calls and reasoning return their own items", () => {
    setDisplayMode("detailed");

    const r1 = transformReasoning({
      item: { type: "reasoning", text: "Planning..." },
      phase: "complete",
    });
    expect(r1?.items).toHaveLength(1);

    const t1 = transformToolCall({
      phase: "complete",
      item: {
        ...toolCall({ type: "shell", command: "ls", output: "" }, "completed", "call-ls"),
        name: "shell",
      },
    });
    expect(t1?.items).toHaveLength(1);

    const t2 = transformToolCall({
      phase: "complete",
      item: {
        ...toolCall({ type: "shell", command: "pwd", output: "" }, "completed", "call-pwd"),
        name: "shell",
      },
    });
    expect(t2?.items).toHaveLength(1);
  });
});
