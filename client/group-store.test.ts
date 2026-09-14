import { describe, expect, it } from "vitest";
import {
  formatGroupSummary,
  registerGroupItem,
  getTurnGroup,
  type GroupItemData,
} from "./group-store";

describe("group-store turn aggregation and formatting", () => {
  it("formats summary with tool actions cleanly", () => {
    const summary = formatGroupSummary({
      turnIndex: 1,
      agentId: "agent-1",
      leaderId: "item-1",
      items: [],
      hasReasoning: true,
      commandCount: 17,
      editCount: 1,
      readCount: 0,
      searchCount: 0,
      otherToolCount: 0,
      isRunning: false,
      hasError: false,
      startedAt: 1000,
    });
    expect(summary).toBe("Thought · Ran 17 commands · Edited 1 file");
  });

  it("handles pluralization correctly", () => {
    const summary1 = formatGroupSummary({
      turnIndex: 1,
      agentId: "agent-1",
      leaderId: "item-1",
      items: [],
      hasReasoning: false,
      commandCount: 1,
      editCount: 2,
      readCount: 3,
      searchCount: 1,
      otherToolCount: 0,
      isRunning: false,
      hasError: false,
      startedAt: 1000,
    });
    expect(summary1).toBe("Ran 1 command · Edited 2 files · Read 3 files · Searched 1 time");
  });

  it("aggregates items and designates the first tool call as leader", () => {
    const item1: GroupItemData = {
      id: "r1",
      type: "reasoning",
      timestamp: 1000,
      reasoningData: { text: "Thinking...", phase: "complete" },
    };
    const res1 = registerGroupItem("test-agent", 1, item1);
    expect(res1.isLeader).toBe(true);

    const item2: GroupItemData = {
      id: "t1",
      type: "tool_call",
      timestamp: 1010,
      toolCallData: {
        name: "shell",
        status: "completed",
        detail: { type: "shell", command: "ls" },
        presentation: { category: "shell", icon: "SquareTerminal", label: "Shell Command" },
      },
    };
    const res2 = registerGroupItem("test-agent", 1, item2);
    expect(res2.isLeader).toBe(false);

    const group = getTurnGroup(res1.groupKey);
    expect(group).toBeDefined();
    expect(group?.hasReasoning).toBe(true);
    expect(group?.commandCount).toBe(1);
    expect(formatGroupSummary(group!)).toBe("Thought · Ran 1 command");
  });

  it("truthfully distinguishes between Write File and Read File", () => {
    // Register a Write File call
    const writeItem: GroupItemData = {
      id: "w1",
      type: "tool_call",
      timestamp: 2000,
      toolCallData: {
        name: "write_to_file",
        status: "completed",
        detail: { type: "write", filePath: "/path/to/file.ts" },
        presentation: { category: "file", icon: "Pencil", label: "Write File", filePath: "/path/to/file.ts" },
      },
    };
    registerGroupItem("turn-write-test", 1, writeItem);

    // Register a Read File call
    const readItem: GroupItemData = {
      id: "r1",
      type: "tool_call",
      timestamp: 2005,
      toolCallData: {
        name: "read_file",
        status: "completed",
        detail: { type: "read", filePath: "/path/to/readme.md" },
        presentation: { category: "file", icon: "Eye", label: "Read File", filePath: "/path/to/readme.md" },
      },
    };
    registerGroupItem("turn-write-test", 1, readItem);

    // Register another Write File call
    const writeItem2: GroupItemData = {
      id: "w2",
      type: "tool_call",
      timestamp: 2010,
      toolCallData: {
        name: "write_to_file",
        status: "completed",
        detail: { type: "write", filePath: "/path/to/config.ts" },
        presentation: { category: "file", icon: "Pencil", label: "Write File", filePath: "/path/to/config.ts" },
      },
    };
    registerGroupItem("turn-write-test", 1, writeItem2);

    const group = getTurnGroup("turn-write-test:1");
    expect(group).toBeDefined();
    expect(group?.editCount).toBe(2);
    expect(group?.readCount).toBe(1);
    expect(formatGroupSummary(group!)).toBe("Edited 2 files · Read 1 file");
  });
});
