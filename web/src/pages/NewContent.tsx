import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, FileImage, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Meta } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type Format = 'carousel' | 'single';

export function NewContent() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta>({ defaultModel: null, slideCount: { min: 6, max: 9, default: 7 } });
  const [format, setFormat] = useState<Format>('carousel');
  const [slideCount, setSlideCount] = useState(7);
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [model, setModel] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const topicRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.meta().then(m => { setMeta(m); setSlideCount(m.slideCount.default); }).catch(() => {});
    topicRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) { toast.error('Inserisci un argomento'); return; }
    setLoading(true);
    try {
      const job = await api.generate.start({
        topic: topic.trim(),
        format,
        slideCount: format === 'carousel' ? slideCount : undefined,
        instructions: instructions.trim() || undefined,
        model: model.trim() || undefined,
      });
      toast.success('Generazione avviata');
      navigate(`/job/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Nuovo contenuto</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Descrivi l'argomento: gli agenti AI fanno ricerca, struttura e design automaticamente.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Format */}
        <div className="space-y-3">
          <Label>Formato</Label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'carousel' as Format, label: 'Carosello', desc: '6–9 slide, ideale per educare', Icon: Layers },
              { id: 'single' as Format, label: 'Post singolo', desc: '1 slide, un concetto chiaro', Icon: FileImage },
            ] as const).map(({ id, label, desc, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormat(id)}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  format === id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40 bg-card',
                )}
              >
                <Icon
                  size={20}
                  className={cn('mb-2', format === id ? 'text-primary' : 'text-muted-foreground')}
                />
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Slide count */}
        {format === 'carousel' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Numero di slide</Label>
              <span className="text-sm font-bold tabular-nums text-primary">{slideCount}</span>
            </div>
            <Slider
              min={meta.slideCount.min}
              max={meta.slideCount.max}
              step={1}
              value={[slideCount]}
              onValueChange={([v]) => setSlideCount(v)}
            />
            <p className="text-xs text-muted-foreground">
              Include sempre cover + CTA. Tra queste, {slideCount - 2} slide di contenuto.
            </p>
          </div>
        )}

        <Separator />

        {/* Topic */}
        <div className="space-y-2">
          <Label htmlFor="topic">
            Argomento <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="topic"
            ref={topicRef}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Es. La leva del tempo negli investimenti a lungo termine"
            rows={3}
            className="resize-none"
          />
        </div>

        {/* Instructions */}
        <div className="space-y-2">
          <Label htmlFor="instructions">Istruzioni aggiuntive</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="Es. Tono educativo, pubblico principiante. Usa un esempio numerico sull'interesse composto."
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Tono, pubblico target, stile, esempi specifici da includere…
          </p>
        </div>

        {/* Advanced toggle */}
        <div>
          <button
            type="button"
            onClick={() => setAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              size={15}
              className={cn('transition-transform', advanced && 'rotate-180')}
            />
            Opzioni avanzate
          </button>

          {advanced && (
            <div className="mt-4 space-y-4 pl-4 border-l-2 border-border">
              <div className="space-y-2">
                <Label htmlFor="model">Modello LLM</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder={meta.defaultModel ?? 'default dal server (es. gpt-4o)'}
                />
                <p className="text-xs text-muted-foreground">
                  Override del modello. Lascia vuoto per usare la configurazione del server.
                </p>
              </div>
            </div>
          )}
        </div>

        <Button type="submit" disabled={loading} size="lg" className="w-full font-semibold">
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Avvio generazione…
            </>
          ) : (
            '🚀  Genera contenuto'
          )}
        </Button>
      </form>
    </div>
  );
}
