import { useEffect, useState } from 'react';
import { Palette, Loader2, Plus, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, type BrandKit as IBrandKit } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const EMPTY: IBrandKit = {
  name: '', tagline: '', audience: '', tone: '', language: 'Italian',
  brandColors: { primary: '#4F46E5', positive: '#059669', negative: '#DC2626', paper: '#FFFFFF', ink: '#111827', muted: '#6B7280' },
  font: { family: 'Inter', source: 'bundled' },
  hashtags: [], ctas: [],
  dos: '', donts: '', notes: '',
};

/* ── Tag input (enter to add, click × to remove) ───────────────── */
function TagInput({
  values, onChange, placeholder,
}: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <div className="rounded-md border bg-background px-2 py-2 flex flex-wrap gap-1.5">
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {v}
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-destructive">
            <X size={12} />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1 flex-1 min-w-[140px]">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none px-1 py-0.5"
        />
        {draft.trim() && (
          <button type="button" onClick={add} className="text-primary"><Plus size={14} /></button>
        )}
      </div>
    </div>
  );
}

export function BrandKit() {
  const [kit, setKit] = useState<IBrandKit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.brand.get()
      .then(r => { setKit(r.kit ?? EMPTY); setSaved(r.saved); })
      .catch(() => setKit(EMPTY));
  }, []);

  const set = <K extends keyof IBrandKit>(key: K, value: IBrandKit[K]) =>
    setKit(k => (k ? { ...k, [key]: value } : k));

  const handleSave = async () => {
    if (!kit) return;
    setSaving(true);
    try {
      await api.brand.save(kit);
      setSaved(true);
      toast.success('Brand kit saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!kit) return (
    <div className="p-8 max-w-2xl space-y-6 animate-fade-in">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );

  return (
    <div className="p-8 max-w-2xl animate-fade-in pb-24">
      <div className="flex items-center gap-2.5 mb-1">
        <Palette size={20} className="text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Brand kit</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Brand identity the AI uses to keep generated content, edits and captions consistent.
        {!saved && ' Not saved yet: default values are in use.'}
      </p>

      <div className="space-y-7">
        {/* Identity */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identity</h2>
          <div className="space-y-2">
            <Label htmlFor="name">Brand name</Label>
            <Input id="name" value={kit.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Acme" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input id="tagline" value={kit.tagline} onChange={e => set('tagline', e.target.value)} placeholder="e.g. Learn something new every day" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audience">Target audience</Label>
            <Textarea id="audience" rows={2} value={kit.audience} onChange={e => set('audience', e.target.value)}
              placeholder="e.g. Professionals aged 25–40 who want to grow" className="resize-none" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tone of voice</Label>
            <Textarea id="tone" rows={2} value={kit.tone} onChange={e => set('tone', e.target.value)}
              placeholder="e.g. Clear, authoritative yet approachable, never jargon-heavy" className="resize-none" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Content language</Label>
            <Input id="language" value={kit.language ?? ''} onChange={e => set('language', e.target.value)} placeholder="e.g. English, Italian, Spanish" />
            <p className="text-xs text-muted-foreground">The language the AI writes slides and captions in.</p>
          </div>
        </section>

        <Separator />

        {/* Brand Colors */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colors</h2>
          {(
            [
              { key: 'primary',  label: 'Primary',   hint: 'Titles, borders, CTA button' },
              { key: 'positive', label: 'Positive',  hint: 'Growth, positive keywords' },
              { key: 'negative', label: 'Negative',  hint: 'Risk, loss' },
              { key: 'paper',    label: 'Background', hint: 'Canvas background (usually white)' },
              { key: 'ink',      label: 'Text',      hint: 'Main body text' },
              { key: 'muted',    label: 'Secondary', hint: 'Captions, notes, secondary text' },
            ] as const
          ).map(({ key, label, hint }) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={kit.brandColors[key]}
                onChange={e => set('brandColors', { ...kit.brandColors, [key]: e.target.value })}
                className="w-10 h-10 rounded-md border cursor-pointer p-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              <Input
                className="w-28 font-mono text-sm shrink-0"
                value={kit.brandColors[key]}
                onChange={e => set('brandColors', { ...kit.brandColors, [key]: e.target.value })}
              />
            </div>
          ))}
        </section>

        <Separator />

        {/* Font */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Font</h2>
          <div className="space-y-2">
            <Label htmlFor="fontFamily">Main font</Label>
            <select
              id="fontFamily"
              value={kit.font.family}
              onChange={e => set('font', { ...kit.font, family: e.target.value, source: 'bundled' as const })}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="Inter">Inter (default)</option>
              <option value="Montserrat">Montserrat</option>
              <option value="Poppins">Poppins</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Fonts must be present in <code>public/fonts/</code> to be used for rendering.
            </p>
          </div>
        </section>

        <Separator />

        {/* Logo */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Logo</h2>
          <div className="flex items-center gap-4">
            <img
              src={`/api/brand/logo?t=${Date.now()}`}
              alt="current logo"
              className="w-16 h-16 object-contain rounded-lg border bg-white p-1 shrink-0"
            />
            <div className="space-y-1">
              <Label htmlFor="logoUpload" className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('logoUpload')?.click()}>
                  Upload logo (PNG/JPG/SVG, max 2 MB)
                </Button>
              </Label>
              <input
                id="logoUpload"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append('logo', file);
                  try {
                    const res = await fetch('/api/brand/logo', { method: 'POST', body: fd });
                    if (!res.ok) throw new Error('Upload failed');
                    toast.success('Logo uploaded');
                    // Force the image to reload by bumping the timestamp
                    const img = document.querySelector('img[alt="current logo"]') as HTMLImageElement | null;
                    if (img) img.src = `/api/brand/logo?t=${Date.now()}`;
                  } catch { toast.error('Logo upload failed'); }
                  // Reset the input so the same file can be uploaded again
                  e.target.value = '';
                }}
              />
              <p className="text-xs text-muted-foreground">The logo is embedded in every generated slide.</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Copy */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Copy & social</h2>
          <div className="space-y-2">
            <Label>Recurring hashtags</Label>
            <TagInput values={kit.hashtags} onChange={v => set('hashtags', v)} placeholder="education, then Enter" />
            <p className="text-xs text-muted-foreground">Without the # symbol, it is added automatically.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ctas">Preferred calls to action</Label>
            <Textarea id="ctas" rows={3} value={kit.ctas.join('\n')}
              onChange={e => set('ctas', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              placeholder={'One per line.\ne.g. Save this post\nFollow us for more tips'} className="resize-none" />
          </div>
        </section>

        <Separator />

        {/* Guidelines */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Guidelines</h2>
          <div className="space-y-2">
            <Label htmlFor="dos">Do</Label>
            <Textarea id="dos" rows={3} value={kit.dos} onChange={e => set('dos', e.target.value)}
              placeholder="e.g. Use concrete examples. Explain technical terms." className="resize-none" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="donts">Don't</Label>
            <Textarea id="donts" rows={3} value={kit.donts} onChange={e => set('donts', e.target.value)}
              placeholder="e.g. No unrealistic promises. Avoid jargon." className="resize-none" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Additional notes</Label>
            <Textarea id="notes" rows={3} value={kit.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Anything else the AI should know." className="resize-none" />
          </div>
        </section>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-56 right-0 border-t bg-background/95 backdrop-blur px-8 py-3 flex justify-end z-10">
        <Button onClick={handleSave} disabled={saving} size="lg" className="font-semibold">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save brand kit'}
        </Button>
      </div>
    </div>
  );
}
