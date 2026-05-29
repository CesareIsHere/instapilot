import { manifest } from '@/assets/manifest';

const FORBIDDEN_TAG = /<script[\s>]/i;
const FORBIDDEN_HANDLER = /\bon\w+\s*=/i;
const REMOTE_URL = /https?:\/\//i;
const ASSET_TOKEN = /\{\{asset:([^}]+)\}\}/g;

export interface ValidationError {
  code: 'INVALID_HTML';
  detail: string;
}

export function validateGeneratedHtml(bodyHtml: string, css: string): ValidationError | null {
  const combined = bodyHtml + '\n' + css;

  if (FORBIDDEN_TAG.test(combined)) {
    return { code: 'INVALID_HTML', detail: '<script> tag not allowed' };
  }
  if (FORBIDDEN_HANDLER.test(combined)) {
    return { code: 'INVALID_HTML', detail: 'inline event handler (on*=) not allowed' };
  }
  if (REMOTE_URL.test(combined)) {
    return { code: 'INVALID_HTML', detail: 'remote http(s):// URLs not allowed — use {{asset:<id>}} tokens' };
  }

  // Validate asset tokens reference known ids
  let match: RegExpExecArray | null;
  while ((match = ASSET_TOKEN.exec(combined)) !== null) {
    const id = match[1].trim();
    if (!manifest[id]) {
      return { code: 'INVALID_HTML', detail: `unknown asset id: "${id}" — available: ${Object.keys(manifest).join(', ')}` };
    }
  }

  return null;
}
