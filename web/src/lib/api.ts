async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...init, headers: { ...headers, ...init?.headers } });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const d = data as Record<string, unknown>;
    const msg = (d?.message || d?.error || text?.slice(0, 200) || `Errore ${res.status}`) as string;
    throw new Error(msg);
  }
  return data as T;
}

/* ── Types ─────────────────────────────────────────────────── */
export interface LibraryItem {
  id: string; title: string; topic: string;
  format: 'single' | 'carousel'; framework?: string;
  slideCount: number; createdAt: string; updatedAt?: string;
  coverUrl: string | null;
  totalTokens?: number; cost?: number;
}

export interface SlideVersion {
  id: string; at: string; label: string;
  imageUrl: string; htmlUrl: string;
}

export interface BrandColors {
  primary: string;
  positive: string;
  negative: string;
  paper: string;
  ink: string;
  muted: string;
}

export interface BrandFont {
  family: string;
  source: 'bundled' | 'custom';
}

export interface BrandKit {
  name: string;
  tagline: string;
  audience: string;
  tone: string;
  brandColors: BrandColors;
  font: BrandFont;
  logoPath?: string;
  hashtags: string[];
  ctas: string[];
  dos: string;
  donts: string;
  notes: string;
}

export interface PublicConfig {
  baseURL?: string;
  model?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  models?: Record<string, string>;
  hasApiKey: boolean;
  apiKeyLast4?: string;
}

export interface ConfigPatch {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  models?: Record<string, string>;
}

export interface Pricing {
  inputPer1M: number; outputPer1M: number; currency: string;
}

export interface Slide {
  index: number; role: string; narrativeFunction?: string;
  file: string; htmlFile: string; intent?: string;
  warnings?: unknown[]; editedAt?: string; lastEditSummary?: string;
  imageUrl: string; htmlUrl: string;
  attempts?: unknown; usage?: { totalTokens: number; calls: number };
  designSpec?: { recipe: string };
}

export interface Caption {
  text: string;
  hashtags: string[];
  generatedAt: string;
}

export interface ContentDetail {
  id: string; carouselId?: string; topic: string;
  format: 'single' | 'carousel'; framework?: string;
  title: string; angle?: string; createdAt: string; updatedAt?: string;
  usage?: { totalTokens: number; promptTokens: number; completionTokens: number; calls: number };
  warnings?: { research: string[]; plan: string[] };
  caption?: Caption;
  cost?: number; currency?: string;
  slides: Slide[];
}

export interface Job {
  id: string; status: 'running' | 'done' | 'error';
  createdAt: string; updatedAt: string;
  input: { topic: string; format: 'single' | 'carousel'; slideCount: number; instructions?: string; model?: string; useWebSearch?: boolean };
  progress: { phase: string; detail?: string; current?: number; total?: number };
  error?: { code?: string; message: string };
  contentId?: string;
  result?: unknown;
}

export interface Meta {
  defaultModel: string | null;
  slideCount: { min: number; max: number; default: number };
  pricing?: Pricing;
}

/* ── API ────────────────────────────────────────────────────── */
export const api = {
  health: () => apiFetch<{ status: string; bundleReady: boolean; hasApiKey?: boolean }>('/health'),
  meta: () => apiFetch<Meta>('/api/meta'),

  library: {
    list: () => apiFetch<{ items: LibraryItem[] }>('/api/library'),
    get: (id: string) => apiFetch<ContentDetail>(`/api/library/${id}`),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),
    getSlideHtml: async (id: string, n: number): Promise<string> => {
      const res = await fetch(`/api/library/${id}/slides/${n}/html`);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      return res.text();
    },
    saveSlideHtml: (id: string, n: number, html: string) =>
      apiFetch<{ ok: boolean; imageUrl: string; editedAt: string; warnings: number }>(
        `/api/library/${id}/slides/${n}/html`,
        { method: 'PUT', body: JSON.stringify({ html }) },
      ),
    aiEditSlide: (id: string, n: number, instruction: string, model?: string) =>
      apiFetch<{ ok: boolean; summary: string; html: string; imageUrl: string; editedAt: string; warnings: number }>(
        `/api/library/${id}/slides/${n}/ai-edit`,
        { method: 'POST', body: JSON.stringify({ instruction, model: model || undefined }) },
      ),
    generateCaption: (id: string) =>
      apiFetch<{ ok: boolean; caption: Caption }>(`/api/library/${id}/caption`, { method: 'POST', body: '{}' }),
    exportUrl: (id: string) => `/api/library/${id}/export`,
    slideHistory: (id: string, n: number) =>
      apiFetch<{ versions: SlideVersion[] }>(`/api/library/${id}/slides/${n}/history`),
    revertSlide: (id: string, n: number, versionId: string) =>
      apiFetch<{ ok: boolean; imageUrl: string; editedAt: string; warnings: number }>(
        `/api/library/${id}/slides/${n}/revert`,
        { method: 'POST', body: JSON.stringify({ id: versionId }) },
      ),
  },

  brand: {
    get: () => apiFetch<{ kit: BrandKit; saved: boolean }>('/api/brand'),
    save: (kit: BrandKit) =>
      apiFetch<{ ok: boolean; kit: BrandKit }>('/api/brand', { method: 'PUT', body: JSON.stringify(kit) }),
  },

  config: {
    get: () => apiFetch<PublicConfig>('/api/config'),
    save: (patch: ConfigPatch) =>
      apiFetch<PublicConfig>('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),
  },

  generate: {
    start: (body: { topic: string; format: string; slideCount?: number; instructions?: string; model?: string; useWebSearch?: boolean }) =>
      apiFetch<Job>('/api/generate', { method: 'POST', body: JSON.stringify(body) }),
    list: () => apiFetch<{ jobs: Job[] }>('/api/generate'),
    get: (id: string) => apiFetch<Job>(`/api/generate/${id}`),
    retry: (id: string) => apiFetch<Job>(`/api/generate/${id}/retry`, { method: 'POST', body: '{}' }),
  },
};
