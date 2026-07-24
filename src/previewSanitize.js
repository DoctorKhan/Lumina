import DOMPurify from 'dompurify';

/**
 * Sanitize rendered markdown before assigning to innerHTML. Treats document and
 * model output as untrusted data (Serenus One protocol pillar).
 */
export function sanitizePreviewHtml(html) {
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true, svg: true, mathMl: true },
        ADD_ATTR: ['target', 'rel', 'class', 'id', 'aria-hidden', 'viewBox', 'xmlns'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base'],
        FORBID_ATTR: [
            'onerror',
            'onload',
            'onclick',
            'onmouseover',
            'onfocus',
            'onblur',
            'oninput',
            'onchange'
        ],
        ALLOW_UNKNOWN_PROTOCOLS: false
    });
}
