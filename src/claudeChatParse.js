/**
 * Reduces the `claude` CLI's bidirectional `stream-json` events (one parsed JSON
 * object per stdout line) into a chat view model the Claude pane can render.
 *
 * Pure + DOM-free so it is unit-testable. The webview wires it up as:
 *   line -> parseChatLine(line) -> reduceChatEvent(state, evt) -> render(state)
 *
 * Event shapes consumed (claude 2.1.x, run with --include-partial-messages):
 *   {type:"system", subtype:"init", session_id, model, cwd}
 *   {type:"stream_event", event:{...Anthropic SSE...}}  (live token streaming)
 *   {type:"assistant", message:{id, content:[...]}}      (authoritative snapshot)
 *   {type:"user", message:{content:[{type:"tool_result", tool_use_id, ...}]}}
 *   {type:"result", subtype, is_error, duration_ms, total_cost_usd, result}
 *   {type:"__stderr", text}  /  {type:"__exit"}          (synthesized by Rust)
 * Other system subtypes (hook_*, status, thinking_tokens) are ignored.
 */

/**
 * @typedef {Object} ChatBlock
 * @property {'text'|'thinking'|'tool'} kind
 * @property {string} [text]        // text / thinking content
 * @property {string} [id]          // tool_use id
 * @property {string} [name]        // tool name
 * @property {any}    [input]       // parsed tool input (once available)
 * @property {string} [inputJson]   // accumulating partial tool input json
 * @property {string|null} [result] // tool result text (once it returns)
 * @property {boolean} [isError]    // tool errored
 * @property {boolean} [done]       // block finished streaming
 *
 * @typedef {Object} ChatTurn
 * @property {'user'|'assistant'} role
 * @property {string} [text]          // user turns
 * @property {ChatBlock[]} [blocks]   // assistant turns
 * @property {string} [messageId]     // assistant message id (for reconciliation)
 * @property {boolean} [done]
 *
 * @typedef {Object} ChatState
 * @property {ChatTurn[]} turns
 * @property {{sessionId:string,model:string,cwd:string}|null} session
 * @property {boolean} busy
 * @property {{isError:boolean,durationMs:number|null,costUsd:number|null,text:string|null}|null} result
 * @property {string|null} error
 * @property {boolean} exited
 */

/** @returns {ChatState} */
export function createChatState() {
    return {
        turns: [],
        session: null,
        busy: false,
        result: null,
        error: null,
        exited: false
    };
}

/** Safe JSON.parse for one stdout line; returns null on malformed input. */
export function parseChatLine(line) {
    if (typeof line !== "string") return null;
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

/**
 * Appends a locally-sent user message. The CLI does not echo user turns back, so
 * the webview adds them itself when sending, then flips into the busy state.
 * @param {ChatState} state
 */
export function appendUserTurn(state, text) {
    state.turns.push({ role: "user", text: String(text ?? "") });
    state.busy = true;
    state.result = null;
    state.error = null;
    return state;
}

/**
 * Folds one parsed event into the state, mutating and returning it (mirrors the
 * in-place style of installProgressParse.js).
 * @param {ChatState} state
 * @param {any} evt
 */
export function reduceChatEvent(state, evt) {
    if (!evt || typeof evt !== "object") return state;
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
        case "stream_event":
            return reduceStreamEvent(state, evt.event);
        case "assistant":
            reconcileAssistant(state, evt.message);
            return state;
        case "user":
            attachToolResults(state, evt.message);
            return state;
        case "result":
            state.busy = false;
            state.result = {
                isError: Boolean(evt.is_error),
                durationMs: typeof evt.duration_ms === "number" ? evt.duration_ms : null,
                costUsd: typeof evt.total_cost_usd === "number" ? evt.total_cost_usd : null,
                text: typeof evt.result === "string" ? evt.result : null
            };
            finalizeActiveTurn(state);
            return state;
        case "__stderr":
            state.error = evt.text || "Claude error";
            return state;
        case "__exit":
            state.busy = false;
            state.exited = true;
            finalizeActiveTurn(state);
            return state;
        default:
            return state;
    }
}

function reduceStreamEvent(state, ev) {
    if (!ev || typeof ev !== "object") return state;
    switch (ev.type) {
        case "message_start": {
            state.turns.push({
                role: "assistant",
                blocks: [],
                messageId: ev.message?.id ?? null,
                done: false
            });
            state.busy = true;
            return state;
        }
        case "content_block_start": {
            const turn = ensureAssistantTurn(state);
            turn.blocks[ev.index] = blockFromContent(ev.content_block || {});
            return state;
        }
        case "content_block_delta": {
            const turn = ensureAssistantTurn(state);
            const block = turn.blocks[ev.index];
            if (!block) return state;
            const delta = ev.delta || {};
            if (delta.type === "text_delta") block.text = (block.text || "") + (delta.text || "");
            else if (delta.type === "thinking_delta")
                block.text = (block.text || "") + (delta.thinking || "");
            else if (delta.type === "input_json_delta")
                block.inputJson = (block.inputJson || "") + (delta.partial_json || "");
            return state;
        }
        case "content_block_stop": {
            const turn = ensureAssistantTurn(state);
            const block = turn.blocks[ev.index];
            if (block) {
                block.done = true;
                if (block.kind === "tool" && block.input == null && block.inputJson) {
                    try {
                        block.input = JSON.parse(block.inputJson);
                    } catch {
                        /* keep raw json */
                    }
                }
            }
            return state;
        }
        case "message_stop": {
            const turn = lastAssistantTurn(state);
            if (turn) turn.done = true;
            return state;
        }
        default:
            return state;
    }
}

/** Maps an Anthropic content block into a view-model block. */
function blockFromContent(cb) {
    if (cb.type === "thinking") return { kind: "thinking", text: cb.thinking || "", done: false };
    if (cb.type === "tool_use") {
        return {
            kind: "tool",
            id: cb.id ?? null,
            name: cb.name ?? "tool",
            input: cb.input ?? null,
            inputJson: "",
            result: null,
            isError: false,
            done: false
        };
    }
    // default to text (covers "text" and anything unknown so nothing is dropped)
    return { kind: "text", text: cb.text || "", done: false };
}

/**
 * Reconciles an authoritative assistant snapshot into the matching turn. Works
 * whether or not partial streaming created the turn first (matched by message
 * id). Preserves any tool results already attached from a later user event.
 */
function reconcileAssistant(state, message) {
    if (!message || !Array.isArray(message.content)) return;
    let turn = lastAssistantTurn(state);
    if (!turn || (message.id && turn.messageId && turn.messageId !== message.id)) {
        turn = { role: "assistant", blocks: [], messageId: message.id ?? null, done: false };
        state.turns.push(turn);
    }
    if (message.id) turn.messageId = message.id;

    message.content.forEach((cb, index) => {
        const mapped = blockFromContent(cb);
        const existing = turn.blocks[index];
        if (existing && existing.kind === "tool" && existing.result != null) {
            mapped.result = existing.result;
            mapped.isError = existing.isError;
        }
        // Snapshot text is authoritative; mark done since the block is complete.
        mapped.done = true;
        turn.blocks[index] = mapped;
    });
    state.busy = true;
}

/** Attaches tool_result content (a CLI "user" event) to its tool_use block. */
function attachToolResults(state, message) {
    if (!message || !Array.isArray(message.content)) return;
    for (const item of message.content) {
        if (!item || item.type !== "tool_result") continue;
        const block = findToolBlock(state, item.tool_use_id);
        if (block) {
            block.result = toolResultText(item.content);
            block.isError = Boolean(item.is_error);
            block.done = true;
        }
    }
}

function toolResultText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((c) => (typeof c === "string" ? c : c?.text || ""))
            .join("");
    }
    return "";
}

function findToolBlock(state, toolUseId) {
    if (!toolUseId) return null;
    for (let t = state.turns.length - 1; t >= 0; t -= 1) {
        const turn = state.turns[t];
        if (turn.role !== "assistant" || !turn.blocks) continue;
        for (const block of turn.blocks) {
            if (block && block.kind === "tool" && block.id === toolUseId) return block;
        }
    }
    return null;
}

function lastAssistantTurn(state) {
    for (let i = state.turns.length - 1; i >= 0; i -= 1) {
        if (state.turns[i].role === "assistant") return state.turns[i];
    }
    return null;
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

/** A short human label for a tool block, e.g. "Edit notes.md" or "Bash". */
export function describeTool(block) {
    if (!block || block.kind !== "tool") return "";
    const name = block.name || "tool";
    const input = block.input || {};
    const path = input.file_path || input.path || input.notebook_path;
    if (path) {
        const base = String(path).split("/").filter(Boolean).pop() || path;
        return `${name} ${base}`;
    }
    if (name === "Bash" && typeof input.command === "string") {
        const cmd = input.command.trim().split("\n")[0];
        return cmd.length > 48 ? `Bash ${cmd.slice(0, 45)}…` : `Bash ${cmd}`;
    }
    return name;
}
