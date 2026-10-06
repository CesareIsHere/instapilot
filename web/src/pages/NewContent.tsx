import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, FileImage, ChevronDown, Loader2, Globe } from 'lucide-react';
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
  const [useWebSearch, setUseWebSearch] = useState(true);
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
    if (!topic.trim()) { toast.error('Enter a topic'); return; }
    setLoading(true);
    try {
      const job = await api.generate.start({
        topic: topic.trim(),
        format,
        slideCount: format === 'carousel' ? slideCount : undefined,
        instructions: instructions.trim() || undefined,
        useWebSearch,
        model: model.trim() || undefined,
      });
      toast.success('Generation started');
      navigate(`/job/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">New content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Describe the topic: the AI agents take care of research, structure and design.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-7">
        {/* Format */}
        <div className="space-y-3">
          <Label>Format</Label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'carousel' as Format, label: 'Carousel', desc: '6–9 slides, great for teaching', Icon: Layers },
              { id: 'single' as Format, label: 'Single post', desc: '1 slide, one clear idea', Icon: FileImage },
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
              <Label>Number of slides</Label>
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
              Always includes a cover + CTA, with {slideCount - 2} content slides in between.
            </p>
          </div>
        )}

        <Separator />

        {/* Topic */}
        <div className="space-y-2">
          <Label htmlFor="topic">
            Topic <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="topic"
            ref={topicRef}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Why small habits beat big resolutions"
            rows={3}
            className="resize-none"
          />
        </div>

        {/* Instructions */}
        <div className="space-y-2">
          <Label htmlFor="instructions">Additional instructions</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="e.g. Educational tone, beginner audience. Include a practical example and one concrete figure."
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Tone, target audience, style, specific examples to include…
          </p>
        </div>

        {/* Web search toggle */}
        <button
          type="button"
          onClick={() => setUseWebSearch(v => !v)}
          aria-pressed={useWebSearch}
          className={cn(
            'w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all',
            useWebSearch
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/40 bg-card',
          )}
        >
          <Globe
            size={20}
            className={cn(useWebSearch ? 'text-primary' : 'text-muted-foreground')}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Web search</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {useWebSearch
                ? 'On: the researcher looks up fresh data online (more tokens).'
                : 'Turn off for evergreen topics: uses only the model\'s knowledge (fewer tokens).'}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors',
              useWebSearch ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                useWebSearch ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </span>
        </button>

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
            Advanced options
          </button>

          {advanced && (
            <div className="mt-4 space-y-4 pl-4 border-l-2 border-border">
              <div className="space-y-2">
                <Label htmlFor="model">LLM model</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder={meta.defaultModel ?? 'server default (e.g. gpt-4o)'}
                />
                <p className="text-xs text-muted-foreground">
                  Model override. Leave empty to use the server configuration.
                </p>
              </div>
            </div>
          )}
        </div>

        <Button type="submit" disabled={loading} size="lg" className="w-full font-semibold">
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Starting generation…
            </>
          ) : (
            '🚀  Generate content'
          )}
        </Button>
      </form>
    </div>
  );
}
