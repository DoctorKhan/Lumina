import assert from "node:assert/strict";
import test from "node:test";
import {
    appendUserTurn,
    createChatState,
    describeTool,
    parseChatLine,
    reduceChatEvent
} from "../src/claudeChatParse.js";

function replay(events) {
    const state = createChatState();
    for (const evt of events) reduceChatEvent(state, evt);
    return state;
}

test("parseChatLine tolerates blank and malformed lines", () => {
    assert.equal(parseChatLine(""), null);
    assert.equal(parseChatLine("   "), null);
    assert.equal(parseChatLine("not json"), null);
    assert.deepEqual(parseChatLine('{"type":"x"}'), { type: "x" });
});

test("init populates session and marks busy", () => {
    const state = replay([
        { type: "system", subtype: "init", session_id: "s1", model: "claude-x", cwd: "/tmp" }
    ]);
    assert.deepEqual(state.session, { sessionId: "s1", model: "claude-x", cwd: "/tmp" });
    assert.equal(state.busy, true);
});

test("ignores noisy system subtypes", () => {
    const state = replay([
        { type: "system", subtype: "hook_started" },
        { type: "system", subtype: "status", status: "requesting" },
        { type: "system", subtype: "thinking_tokens", estimated_tokens: 8 }
    ]);
    assert.equal(state.turns.length, 0);
    assert.equal(state.session, null);
});

test("streams a text turn from partial deltas and reconciles the snapshot", () => {
    const state = replay([
        { type: "system", subtype: "init", session_id: "s", model: "m", cwd: "/" },
        { type: "stream_event", event: { type: "message_start", message: { id: "msg1" } } },
        {
            type: "stream_event",
            event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }
        },
        {
            type: "stream_event",
            event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } }
        },
        {
            type: "stream_event",
            event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } }
        },
        { type: "stream_event", event: { type: "content_block_stop", index: 0 } },
        {
            type: "assistant",
            message: { id: "msg1", content: [{ type: "text", text: "Hello world" }] }
        },
        { type: "stream_event", event: { type: "message_stop" } },
        { type: "result", subtype: "success", is_error: false, duration_ms: 1200, total_cost_usd: 0.01, result: "Hello world" }
    ]);

    assert.equal(state.turns.length, 1);
    const turn = state.turns[0];
    assert.equal(turn.role, "assistant");
    assert.equal(turn.messageId, "msg1");
    assert.equal(turn.blocks.length, 1);
    assert.equal(turn.blocks[0].kind, "text");
    assert.equal(turn.blocks[0].text, "Hello world");
    assert.equal(turn.done, true);
    assert.equal(state.busy, false);
    assert.deepEqual(state.result, {
        isError: false,
        durationMs: 1200,
        costUsd: 0.01,
        text: "Hello world"
    });
});

test("captures thinking as its own block", () => {
    const state = replay([
        { type: "stream_event", event: { type: "message_start", message: { id: "m" } } },
        {
            type: "stream_event",
            event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }
        },
        {
            type: "stream_event",
            event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me think" } }
        },
        {
            type: "stream_event",
            event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }
        },
        {
            type: "stream_event",
            event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Done" } }
        }
    ]);
    const blocks = state.turns[0].blocks;
    assert.equal(blocks[0].kind, "thinking");
    assert.equal(blocks[0].text, "Let me think");
    assert.equal(blocks[1].kind, "text");
    assert.equal(blocks[1].text, "Done");
});

test("tool_use streams input json and attaches its result", () => {
    const state = replay([
        { type: "stream_event", event: { type: "message_start", message: { id: "mA" } } },
        {
            type: "stream_event",
            event: {
                type: "content_block_start",
                index: 0,
                content_block: { type: "tool_use", id: "toolu_1", name: "Bash", input: {} }
            }
        },
        {
            type: "stream_event",
            event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"command":' } }
        },
        {
            type: "stream_event",
            event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"echo hi"}' } }
        },
        { type: "stream_event", event: { type: "content_block_stop", index: 0 } },
        {
            type: "assistant",
            message: {
                id: "mA",
                content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "echo hi" } }]
            }
        },
        {
            type: "user",
            message: {
                content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "hi", is_error: false }]
            }
        }
    ]);

    const block = state.turns[0].blocks[0];
    assert.equal(block.kind, "tool");
    assert.equal(block.name, "Bash");
    assert.deepEqual(block.input, { command: "echo hi" });
    assert.equal(block.result, "hi");
    assert.equal(block.isError, false);
    assert.equal(describeTool(block), "Bash echo hi");
});

test("snapshot-only mode (no partial messages) still builds turns", () => {
    const state = replay([
        { type: "system", subtype: "init", session_id: "s", model: "m", cwd: "/" },
        {
            type: "assistant",
            message: { id: "only", content: [{ type: "text", text: "PONG" }] }
        },
        { type: "result", subtype: "success", is_error: false, result: "PONG" }
    ]);
    assert.equal(state.turns.length, 1);
    assert.equal(state.turns[0].blocks[0].text, "PONG");
});

test("appendUserTurn adds a user bubble and sets busy", () => {
    const state = createChatState();
    appendUserTurn(state, "summarize this");
    assert.equal(state.turns.length, 1);
    assert.deepEqual(state.turns[0], { role: "user", text: "summarize this" });
    assert.equal(state.busy, true);
});

test("stderr and exit surface as state", () => {
    const state = createChatState();
    reduceChatEvent(state, { type: "__stderr", text: "boom" });
    assert.equal(state.error, "boom");
    reduceChatEvent(state, { type: "__exit" });
    assert.equal(state.exited, true);
    assert.equal(state.busy, false);
});

test("describeTool prefers file basename", () => {
    assert.equal(
        describeTool({ kind: "tool", name: "Edit", input: { file_path: "/a/b/notes.md" } }),
        "Edit notes.md"
    );
    assert.equal(describeTool({ kind: "tool", name: "Read", input: {} }), "Read");
});
