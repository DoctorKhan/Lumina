/**
 * Reduces Cursor Agent `stream-json` events (from `cursor agent --print
 * --output-format stream-json`) into the same chat view model as the Claude pane.
 *
 * Cursor's format differs from Claude Code: partial assistant text arrives as
 * incremental deltas, tool use is `tool_call` started/completed events, and
 * thinking streams as `{type:"thinking", subtype:"delta"}` lines.
 *
 * Also accepts `{type:"plain_text", text}` events, which the webview synthesizes
 * for CLIs (e.g. Hermes) whose stdout lines are not stream-json.
 */

import {
    appendUserTurn,
    createChatState,
    parseChatLine,
    describeTool as describeClaudeTool
} from "./claudeChatParse.js";

export { appendUserTurn, createChatState, parseChatLine };

/** @param {import("./claudeChatParse.js").ChatState} state */
export function appendQueuedUserTurn(state, text) {
    state.turns.push({ role: "user", text: String(text ?? ""), queued: true });
    return state;
}

/** Activates the oldest queued user bubble when a follow-up send starts. */
export function activateQueuedUserTurn(state) {
    const turn = state.turns.find((t) => t.role === "user" && t.queued);
    if (!turn) return false;
    turn.queued = false;
    state.busy = true;
    state.stalled = false;
    state.result = null;
    state.error = null;
    return true;
}

/** @param {import("./claudeChatParse.js").ChatState} state */
export function reduceAgentChatEvent(state, evt) {
    if (!evt || typeof evt !== "object") return state;
    state.stalled = false;
    switch (evt.type) {
        case "system":
            if (evt.subtype === "init") {
                state.session = {
                    sessionId: evt.session_id ?? null,
                    model: evt.model ?? null,
                    cwd: evt.cwd ?? null
                };
                state.busy = true;
            }
            return state;
        case "thinking":
            if (evt.subtype === "delta") {
                reduceThinkingDelta(state, thinkingTextFromEvent(evt));
            } else if (evt.subtype === "completed") {
                markThinkingComplete(state);
            }
            return state;
        case "tool_call":
            reduceToolCall(state, evt);
            return state;
        case "plain_text":
            reducePlainText(state, evt.text);
            return state;
        case "assistant":
            reduceAgentAssistant(state, evt.message);
            return state;
        case "user":
            // Cursor echoes the user turn; ignore so we don't duplicate the
            // locally-appended bubble.
            return state;
        case "result":
            state.busy = false;
            state.result = {
                isError: Boolean(evt.is_error),
                durationMs: typeof evt.duration_ms === "number" ? evt.duration_ms : null,
                costUsd: null,
                text: typeof evt.result === "string" ? evt.result : null
            };
            finalizeActiveTurn(state);
            return state;
        case "__stderr":
            state.error = evt.text || "Cursor Agent error";
            return state;
        case "__exit":
            // One turn finished; the CLI session may continue via --continue.
            state.busy = false;
            finalizeActiveTurn(state);
            return state;
        default:
            return state;
    }
}

function thinkingTextFromEvent(evt) {
    if (!evt || typeof evt !== "object") return "";
    const raw = evt.text ?? evt.thinking ?? evt.delta ?? "";
    return typeof raw === "string" ? raw : "";
}

function reduceThinkingDelta(state, text) {
    if (!text) return state;
    const turn = ensureAssistantTurn(state);
    const block = lastOpenBlock(turn, "thinking") || pushBlock(turn, { kind: "thinking", text: "", done: false });
    block.text = (block.text || "") + text;
    state.busy = true;
    return state;
}

function markThinkingComplete(state) {
    const turn = state.turns[state.turns.length - 1];
    if (!turn || turn.role !== "assistant") return state;
    const block = [...(turn.blocks || [])].reverse().find((b) => b && b.kind === "thinking" && !b.done);
    if (block) block.done = true;
    return state;
}

function reduceToolCall(state, evt) {
    const turn = ensureAssistantTurn(state);
    const id = evt.call_id ?? null;
    if (evt.subtype === "started") {
        const name = extractToolName(evt.tool_call);
        let block = turn.blocks.find((b) => b && b.kind === "tool" && b.id === id);
        if (!block) {
            block = {
                kind: "tool",
                id,
                name,
                input: extractToolArgs(evt.tool_call),
                result: null,
                isError: false,
                done: false
            };
            turn.blocks.push(block);
        }
    } else if (evt.subtype === "completed") {
        const block = turn.blocks.find((b) => b && b.kind === "tool" && b.id === id);
        if (block) {
            block.result = extractToolResult(evt.tool_call);
            block.isError = isToolError(evt.tool_call);
            block.done = true;
        }
    }
    state.busy = true;
}

function reducePlainText(state, text) {
    const line = typeof text === "string" ? text : "";
    if (!line.trim()) return state;
    const turn = ensureAssistantTurn(state);
    const block = lastOpenBlock(turn, "text") || pushBlock(turn, { kind: "text", text: "", done: false });
    block.text = block.text ? `${block.text}\n${line}` : line;
    state.busy = true;
    return state;
}

function reduceAgentAssistant(state, message) {
    if (!message || !Array.isArray(message.content)) return;
    const turn = ensureAssistantTurn(state);
    for (const cb of message.content) {
        if (!cb) continue;
        if (cb.type === "thinking") {
            reduceThinkingDelta(state, cb.thinking || cb.text || "");
            continue;
        }
        if (cb.type !== "text") continue;
        const incoming = cb.text || "";
        const block = lastOpenBlock(turn, "text") || pushBlock(turn, { kind: "text", text: "", done: false });
        const current = block.text || "";
        if (incoming.startsWith(current) || incoming.length >= current.length) {
            block.text = incoming;
        } else {
            block.text = current + incoming;
        }
    }
    state.busy = true;
}

// A block can only keep accumulating deltas while it's the tail of the turn —
// once anything else (a tool call, a different block kind) is appended after
// it, it's finished, and new same-kind content must start a fresh block. A
// scan across the whole turn (ignoring position) let a later text chunk splice
// back onto an earlier, already-rendered block whenever a tool call sat
// between them, corrupting/duplicating the transcript.
function lastOpenBlock(turn, kind) {
    const last = turn.blocks[turn.blocks.length - 1];
    return last && last.kind === kind && !last.done ? last : null;
}

function pushBlock(turn, block) {
    turn.blocks.push(block);
    return block;
}

function extractToolName(toolCall) {
    if (!toolCall || typeof toolCall !== "object") return "tool";
    for (const key of Object.keys(toolCall)) {
        if (key.endsWith("ToolCall")) {
            return key.replace(/ToolCall$/, "");
        }
    }
    return "tool";
}

function extractToolArgs(toolCall) {
    if (!toolCall || typeof toolCall !== "object") return null;
    for (const key of Object.keys(toolCall)) {
        if (key.endsWith("ToolCall") && toolCall[key]?.args) {
            return toolCall[key].args;
        }
    }
    return null;
}

function extractToolResult(toolCall) {
    if (!toolCall || typeof toolCall !== "object") return null;
    for (const key of Object.keys(toolCall)) {
        const entry = toolCall[key];
        const result = entry?.result;
        if (!result) continue;
        if (typeof result === "string") return result;
        if (result.error) {
            return typeof result.error === "string" ? result.error : JSON.stringify(result.error, null, 2);
        }
        if (result.success) {
            try {
                return JSON.stringify(result.success, null, 2);
            } catch {
                return String(result.success);
            }
        }
        try {
            return JSON.stringify(result, null, 2);
        } catch {
            return String(result);
        }
    }
    return null;
}

function isToolError(toolCall) {
    if (!toolCall || typeof toolCall !== "object") return false;
    for (const key of Object.keys(toolCall)) {
        const result = toolCall[key]?.result;
        if (result?.error) return true;
    }
    return false;
}

function ensureAssistantTurn(state) {
    const last = state.turns[state.turns.length - 1];
    if (last && last.role === "assistant") return last;
    const turn = { role: "assistant", blocks: [], messageId: null, done: false };
    state.turns.push(turn);
    return turn;
}

function finalizeActiveTurn(state) {
    const turn = state.turns[state.turns.length - 1];
    if (turn && turn.role === "assistant") {
        turn.done = true;
        for (const block of turn.blocks || []) {
            if (block) block.done = true;
        }
    }
}

/** Human label for a Cursor Agent tool block. */
export function describeAgentTool(block) {
    if (!block || block.kind !== "tool") return "";
    const name = block.name || "tool";
    const input = block.input || {};
    const path =
        input.targetDirectory ||
        input.path ||
        input.file_path ||
        input.globPattern ||
        input.pattern;
    if (path) {
        const base = String(path).split("/").filter(Boolean).pop() || path;
        return `${name} ${base}`;
    }
    if (typeof input.command === "string") {
        const cmd = input.command.trim().split("\n")[0];
        return cmd.length > 48 ? `${name} ${cmd.slice(0, 45)}…` : `${name} ${cmd}`;
    }
    return describeClaudeTool(block) || name;
}
