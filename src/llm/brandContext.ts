import fs from 'node:fs';

const MAX_CHARS = 8000;

export function loadBrandContext(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.length > MAX_CHARS) {
      return content.slice(0, MAX_CHARS) + '\n\n[...truncated for token budget]';
    }
    return content;
  } catch {
    return 'Brand context unavailable: file not found or unreadable.';
  }
}
