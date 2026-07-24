import test from "node:test";
import assert from "node:assert/strict";
import {
    activateQueuedUserTurn,
    appendQueuedUserTurn,
    appendUserTurn,
    createChatState,
    describeAgentTool,
    reduceAgentChatEvent
} from "../src/agentChatParse.js";
import { parseChatLine } from "../src/claudeChatParse.js";

test("reduceAgentChatEvent handles thinking deltas and tool calls", () => {
    const state = createChatState();
    appendUserTurn(state, "hello");

    reduceAgentChatEvent(state, {
        type: "thinking",
        subtype: "delta",
        text: "Planning…"
    });
    reduceAgentChatEvent(state, {
        type: "tool_call",
        subtype: "started",
        call_id: "t1",
        tool_call: { globToolCall: { args: { targetDirectory: "/tmp", globPattern: "*.md" } } }
    });
    reduceAgentChatEvent(state, {
        type: "tool_call",
        subtype: "completed",
        call_id: "t1",
        tool_call: {
            globToolCall: {
                result: { success: { files: ["a.md"], totalFiles: 1 } }
            }
        }
    });
    reduceAgentChatEvent(state, {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Hi" }] }
    });
    reduceAgentChatEvent(state, {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Hi there" }] }
    });
    reduceAgentChatEvent(state, {
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: 1200,
        result: "Hi there"
    });

    assert.equal(state.turns.length, 2);
    const assistant = state.turns[1];
    assert.equal(assistant.blocks.some((b) => b.kind === "thinking"), true);
    assert.equal(assistant.blocks.some((b) => b.kind === "tool" && b.result), true);
    assert.equal(assistant.blocks.find((b) => b.kind === "text")?.text, "Hi there");
    assert.equal(state.busy, false);
});

test("plain_text lines accumulate into one assistant text block", () => {
    const state = createChatState();
    appendUserTurn(state, "hello hermes");

    reduceAgentChatEvent(state, { type: "plain_text", text: "First line" });
    reduceAgentChatEvent(state, { type: "plain_text", text: "Second line" });
    reduceAgentChatEvent(state, { type: "plain_text", text: "   " });
    reduceAgentChatEvent(state, { type: "__exit" });

    assert.equal(state.turns.length, 2);
    const assistant = state.turns[1];
    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.blocks.length, 1);
    assert.equal(assistant.blocks[0].kind, "text");
    assert.equal(assistant.blocks[0].text, "First line\nSecond line");
    assert.equal(assistant.blocks[0].done, true);
    assert.equal(state.busy, false);
});

test("__exit clears busy without ending the session", () => {
    const state = createChatState();
    appendUserTurn(state, "turn one");
    reduceAgentChatEvent(state, {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "First reply" }] }
    });
    state.busy = true;
    reduceAgentChatEvent(state, { type: "__exit" });
    assert.equal(state.busy, false);
    assert.equal(state.exited, false);
});

test("text after an interleaved tool call starts a new block instead of splicing onto the earlier one", () => {
    const state = createChatState();
    appendUserTurn(state, "hello");

    reduceAgentChatEvent(state, {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Let me check the file." }] }
    });
    reduceAgentChatEvent(state, {
        type: "tool_call",
        subtype: "started",
        call_id: "t1",
        tool_call: { readToolCall: { args: { path: "/tmp/a.md" } } }
    });
    reduceAgentChatEvent(state, {
        type: "tool_call",
        subtype: "completed",
        call_id: "t1",
        tool_call: { readToolCall: { result: { success: "contents" } } }
    });
    reduceAgentChatEvent(state, {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Found two issues." }] }
    });

    const assistant = state.turns[1];
    const textBlocks = assistant.blocks.filter((b) => b.kind === "text");
    assert.equal(textBlocks.length, 2);
    assert.equal(textBlocks[0].text, "Let me check the file.");
    assert.equal(textBlocks[1].text, "Found two issues.");
});

test("describeAgentTool prefers workspace paths", () => {
    const label = describeAgentTool({
        kind: "tool",
        name: "glob",
        input: { targetDirectory: "/Users/me/docs", globPattern: "**/*" }
    });
    assert.match(label, /docs/);
});

test("thinking completed marks the active block done", () => {
    const state = createChatState();
    appendUserTurn(state, "go");
    reduceAgentChatEvent(state, { type: "thinking", subtype: "delta", text: "Plan" });
    reduceAgentChatEvent(state, { type: "thinking", subtype: "completed" });
    const thinking = state.turns[1].blocks.find((b) => b.kind === "thinking");
    assert.equal(thinking?.text, "Plan");
    assert.equal(thinking?.done, true);
});

test("queued user turns activate instead of duplicating bubbles", () => {
    const state = createChatState();
    appendUserTurn(state, "first");
    appendQueuedUserTurn(state, "second");
    assert.equal(state.turns.length, 2);
    assert.equal(state.turns[1].queued, true);
    assert.equal(activateQueuedUserTurn(state), true);
    assert.equal(state.turns[1].queued, false);
    assert.equal(state.busy, true);
    assert.equal(activateQueuedUserTurn(state), false);
});

test("parseChatLine accepts pre-parsed event objects", () => {
    const evt = { type: "result", subtype: "success", is_error: false };
    assert.deepEqual(parseChatLine(evt), evt);
});
