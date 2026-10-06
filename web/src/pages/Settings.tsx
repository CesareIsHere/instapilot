// web/src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { Loader2, Save, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, type PublicConfig } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function Settings() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.config.get().then(c => {
      setCfg(c);
      setBaseURL(c.baseURL ?? '');
      setModel(c.model ?? '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.config.save({
        baseURL: baseURL.trim() || undefined,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      setCfg(updated);
      setApiKey('');
      toast.success('Settings saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connection to the LLM provider. Stored locally, never sent anywhere else.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="flex items-center gap-1.5">
            <KeyRound size={14} /> API key
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={cfg?.hasApiKey ? `•••• ${cfg.apiKeyLast4 ?? ''}` : 'sk-…'}
          />
          <p className="text-xs text-muted-foreground">
            {cfg?.hasApiKey
              ? 'A key is already saved. Enter a new value only to replace it.'
              : 'No key saved yet: paste one to start generating.'}
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="baseURL">Base URL (optional)</Label>
          <Input id="baseURL" value={baseURL} onChange={e => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1 or your proxy" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Default model</Label>
          <Input id="model" value={model} onChange={e => setModel(e.target.value)}
            placeholder="e.g. gpt-5.4" />
        </div>

        <Button onClick={save} disabled={saving} size="lg" className="font-semibold">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save</>}
        </Button>
      </div>
    </div>
  );
}
