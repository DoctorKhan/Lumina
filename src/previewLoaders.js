/**
 * Preview stack: `marked` is loaded eagerly (small, must match the marked v9+ token renderer API).
 * Mermaid, KaTeX, and highlight.js stay lazy so they only load when needed.
 */
import { marked, Renderer } from 'marked';
import { mayNeedKatex } from './previewMathHeuristic.js';

const renderer = new Renderer();
// Marked v18+ passes a single token: { text, lang, escaped, ... }
renderer.code = (token) => {
    const code = token.text;
    const language = (token.lang || '').trim().toLowerCase();
    if (language === 'mermaid') {
        return `<pre class="mermaid">${code}</pre>`;
    }
    const escapedCode = code
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    const className = language ? `language-${language}` : '';
    return `<pre><code class="${className}">${escapedCode}</code></pre>`;
};

marked.setOptions({
    breaks: false,
    gfm: true
});
marked.use({ renderer });

export { marked, mayNeedKatex };

let hljsModulePromise = null;

function ensureHljs() {
    if (!hljsModulePromise) {
        hljsModulePromise = import('highlight.js').then((m) => m.default);
    }
    return hljsModulePromise;
}

export async function highlightCodeBlocksIn(preview) {
    const blocks = preview.querySelectorAll('pre code:not(.language-mermaid)');
    if (blocks.length === 0) {
        return;
    }
    const hljs = await ensureHljs();
    blocks.forEach((block) => {
        hljs.highlightElement(block);
    });
}

let katexCssPromise = null;

function ensureKatexRender() {
    if (!katexCssPromise) {
        katexCssPromise = (async () => {
            await import('katex/dist/katex.min.css');
            const { default: renderMathInElement } = await import('katex/contrib/auto-render');
            return renderMathInElement;
        })();
    }
    return katexCssPromise;
}

export async function applyKatexToPreview(preview, normalizedSource) {
    if (!mayNeedKatex(normalizedSource)) {
        return;
    }
    const renderMathInElement = await ensureKatexRender();
    renderMathInElement(preview, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
    });
}

let mermaidApi = null;

const MERMAID_INIT = {
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    flowchart: {
        curve: 'basis',
        htmlLabels: true,
        padding: 24,
        nodeSpacing: 56,
        rankSpacing: 64
    },
    themeVariables: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        primaryColor: '#eef2ff',
        primaryTextColor: '#1e293b',
        primaryBorderColor: '#6366f1',
        lineColor: '#64748b',
        secondaryColor: '#e0f2fe',
        tertiaryColor: '#f8fafc',
        clusterBkg: '#f8fafc',
        clusterBorder: '#cbd5e1',
        edgeLabelBackground: '#ffffff'
    }
};

export async function renderMermaidInPreview(preview) {
    const blocks = preview.querySelectorAll('pre.mermaid');
    if (blocks.length === 0) {
        return;
    }
    if (!mermaidApi) {
        mermaidApi = (await import('mermaid')).default;
        mermaidApi.initialize(MERMAID_INIT);
    }
    if (document.fonts?.ready) {
        await document.fonts.ready;
    }
    for (const block of blocks) {
        const source = block.textContent || '';
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
            const { svg } = await mermaidApi.render(id, source);
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid';
            wrapper.innerHTML = svg;
            block.replaceWith(wrapper);
        } catch (error) {
            const fallback = document.createElement('pre');
            fallback.className = 'bg-rose-50 text-rose-700 p-3 rounded';
            fallback.textContent = `Mermaid render error:\n${error?.message || String(error)}`;
            block.replaceWith(fallback);
        }
    }
}
