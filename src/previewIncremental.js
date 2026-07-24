/**
 * Pure helpers for incremental preview rendering. Kept free of DOM/marked
 * coupling so they can be unit-tested in Node. The renderer in main.js feeds
 * these `marked` lexer tokens (top-level blocks) and uses the result to patch
 * only the preview children that actually changed.
 */

// Block token types `marked` renders as exactly one top-level element. `space`
// renders to no element. Any other type — notably `html`, which can emit zero
// or many top-level nodes — breaks the token<->child 1:1 mapping that the
// incremental patch relies on, so its presence forces a full rebuild.
export const SINGLE_ELEMENT_TOKEN_TYPES = new Set([
    'paragraph', 'heading', 'blockquote', 'list', 'code', 'table', 'hr'
]);

export function tokensAreDomMappable(tokens) {
    return tokens.every(
        (token) => token.type === 'space' || SINGLE_ELEMENT_TOKEN_TYPES.has(token.type)
    );
}

// Count tokens in [from, to) that each produce exactly one preview child.
export function countElementTokens(tokens, from, to) {
    let count = 0;
    for (let i = from; i < to; i += 1) {
        if (tokens[i].type !== 'space') count += 1;
    }
    return count;
}

// Length of the common prefix and suffix of two token lists, compared by raw
// source text. The tokens in between are the changed region.
export function diffTokenRange(oldTokens, newTokens) {
    const minLen = Math.min(oldTokens.length, newTokens.length);
    let prefix = 0;
    while (prefix < minLen && oldTokens[prefix].raw === newTokens[prefix].raw) {
        prefix += 1;
    }
    let suffix = 0;
    while (
        suffix < minLen - prefix &&
        oldTokens[oldTokens.length - 1 - suffix].raw ===
            newTokens[newTokens.length - 1 - suffix].raw
    ) {
        suffix += 1;
    }
    return { prefix, suffix };
}
