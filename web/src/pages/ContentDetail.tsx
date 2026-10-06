import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Download, Trash2, Code2, Sparkles, Loader2,
  AlertTriangle, ChevronLeft, ChevronRight, FileArchive, Copy, MessageSquareText, RefreshCw,
  History, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, type ContentDetail as IContentDetail, type Caption, type Slide, type SlideVersion } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtDate, fmtCost, cn } from '@/lib/utils';

/* ── Metadata row ──────────────────────────────────────────── */
function MetaRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">{String(value)}</span>
    </div>
  );
}

/* ── HTML Editor Dialog ────────────────────────────────────── */
interface EditorProps {
  open: boolean;
  onClose: () => void;
  contentId: string;
  slideIndex: number;
  slideLabel: string;
  onSaved: (imageUrl: string, editedAt: string, summary?: string) => void;
}

function HtmlEditorDialog({ open, onClose, contentId, slideIndex, slideLabel, onSaved }: EditorProps) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [applyingAi, setApplyingAi] = useState(false);
  const [scale, setScale] = useState(0.38);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load HTML when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.library.getSlideHtml(contentId, slideIndex)
      .then(h => { setHtml(h); setLoading(false); })
      .catch(err => { toast.error((err as Error).message); onClose(); });
  }, [open, contentId, slideIndex]);

  // Sync iframe content
  useEffect(() => {
    if (iframeRef.current && html && !loading) {
      iframeRef.current.srcdoc = html;
    }
  }, [html, loading]);

  // Responsive preview scaling via ResizeObserver
  const updateScale = useCallback(() => {
    if (!previewPaneRef.current) return;
    const w = previewPaneRef.current.clientWidth - 32;
    setScale(Math.max(0.1, Math.min(1, w / 1080)));
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(updateScale, 80);
    const ro = new ResizeObserver(updateScale);
    if (previewPaneRef.current) ro.observe(previewPaneRef.current);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [open, updateScale]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await api.library.saveSlideHtml(contentId, slideIndex, html);
      toast.success('Slide saved and rendered' + (r.warnings > 0 ? ` (${r.warnings} layout warning${r.warnings === 1 ? '' : 's'})` : ''));
      onSaved(r.imageUrl, r.editedAt);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAiApply = async () => {
    if (!aiInstruction.trim()) return;
    setApplyingAi(true);
    try {
      const r = await api.library.aiEditSlide(contentId, slideIndex, aiInstruction.trim());
      setHtml(r.html);
      setAiInstruction('');
      toast.success(r.summary);
      onSaved(r.imageUrl, r.editedAt, r.summary);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApplyingAi(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden border"
        style={{ width: '92vw', maxWidth: '92vw', height: '90vh', maxHeight: '90vh' }}
      >
        <DialogHeader className="px-5 py-3.5 border-b flex-shrink-0">
          <DialogTitle className="text-sm">
            HTML editor — {slideLabel}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex" style={{ height: 'calc(90vh - 110px)' }}>
            {/* Code pane */}
            <div className="flex flex-col border-r" style={{ width: '50%' }}>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-[#1e1e2e]">
                <Code2 size={12} className="text-[#cdd6f4]/60" />
                <span className="text-[11px] font-mono text-[#cdd6f4]/60">HTML</span>
              </div>
              <textarea
                value={html}
                onChange={e => setHtml(e.target.value)}
                className="code-editor flex-1"
                spellCheck={false}
              />
            </div>

            {/* Preview pane */}
            <div
              ref={previewPaneRef}
              className="bg-zinc-100 overflow-auto p-4"
              style={{ width: '50%', minHeight: `${1350 * scale + 32}px` }}
            >
              <iframe
                ref={iframeRef}
                title="preview"
                sandbox="allow-same-origin"
                style={{
                  width: '1080px', height: '1350px', border: 'none',
                  transform: `scale(${scale})`, transformOrigin: 'top left',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center gap-2.5 flex-shrink-0 bg-background">
          <Sparkles size={14} className="text-primary shrink-0" />
          <Input
            value={aiInstruction}
            onChange={e => setAiInstruction(e.target.value)}
            placeholder='AI edit: e.g. "cut the title in half"'
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAiApply()}
            disabled={applyingAi || loading}
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" variant="outline" onClick={handleAiApply}
            disabled={!aiInstruction.trim() || applyingAi || loading} className="shrink-0">
            {applyingAi ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <Button size="sm" onClick={handleSave} disabled={saving || loading} className="shrink-0">
            {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            {saving ? 'Rendering…' : '💾 Save and render'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Slide version history dialog ──────────────────────────── */
interface HistoryProps {
  open: boolean;
  onClose: () => void;
  contentId: string;
  slideIndex: number;
  slideLabel: string;
  onReverted: (imageUrl: string, editedAt: string) => void;
}

function HistoryDialog({ open, onClose, contentId, slideIndex, slideLabel, onReverted }: HistoryProps) {
  const [versions, setVersions] = useState<SlideVersion[] | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    api.library.slideHistory(contentId, slideIndex)
      .then(r => setVersions(r.versions))
      .catch(err => { toast.error((err as Error).message); onClose(); });
  }, [open, contentId, slideIndex]);

  const handleRevert = async (versionId: string) => {
    setReverting(versionId);
    const toastId = toast.loading('Restoring version…');
    try {
      const r = await api.library.revertSlide(contentId, slideIndex, versionId);
      toast.success('Version restored', { id: toastId });
      onReverted(r.imageUrl, r.editedAt);
      onClose();
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    } finally {
      setReverting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <History size={15} /> History — {slideLabel}
          </DialogTitle>
        </DialogHeader>

        {versions === null ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No previous versions. A version is saved automatically on every edit.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {versions.map(v => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <img src={v.imageUrl} alt={v.label} loading="lazy"
                  className="rounded-md border object-cover shrink-0" style={{ width: 48, aspectRatio: '4/5' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{v.label}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(v.at)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleRevert(v.id)} disabled={reverting !== null} className="shrink-0">
                  {reverting === v.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Quick AI edit prompt ──────────────────────────────────── */
async function quickAiEdit(
  contentId: string, slideIndex: number,
  onSaved: (imageUrl: string, editedAt: string, summary: string) => void,
) {
  const instruction = window.prompt('What do you want to change on this slide?\ne.g. "make the title shorter" or "add a numeric example"');
  if (!instruction?.trim()) return;
  const toastId = toast.loading('Applying AI edit…');
  try {
    const r = await api.library.aiEditSlide(contentId, slideIndex, instruction.trim());
    toast.success(r.summary, { id: toastId });
    onSaved(r.imageUrl, r.editedAt, r.summary);
  } catch (err) {
    toast.error((err as Error).message, { id: toastId });
  }
}

/* ── Main page ─────────────────────────────────────────────── */
export function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<IContentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [slideVersions, setSlideVersions] = useState<Record<number, string>>({});
  const [caption, setCaption] = useState<Caption | null>(null);
  const [captionLoading, setCaptionLoading] = useState(false);

  useEffect(() => { setCaption(data?.caption ?? null); }, [data?.caption]);

  useEffect(() => {
    if (!id) return;
    api.library.get(id)
      .then(d => setData(d))
      .catch(err => setError((err as Error).message));
  }, [id]);

  const currentSlide: Slide | undefined = data?.slides[active];

  // The image URL to display (may be cache-busted after an edit)
  const imageUrl = slideVersions[active] ?? currentSlide?.imageUrl;

  const handleSaved = (slideIdx: number) => (imgUrl: string, editedAt: string, summary?: string) => {
    setSlideVersions(v => ({ ...v, [slideIdx]: imgUrl + '?t=' + Date.now() }));
    if (!data) return;
    const updated = { ...data };
    updated.slides = [...data.slides];
    updated.slides[slideIdx] = {
      ...data.slides[slideIdx],
      editedAt,
      ...(summary ? { lastEditSummary: summary } : {}),
    };
    setData(updated);
  };

  const handleDelete = async () => {
    if (!id || !confirm('Permanently delete this content?')) return;
    try {
      await api.library.delete(id);
      toast.success('Content deleted');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleGenerateCaption = async () => {
    if (!id) return;
    setCaptionLoading(true);
    const toastId = toast.loading(caption ? 'Regenerating caption…' : 'Generating caption…');
    try {
      const r = await api.library.generateCaption(id);
      setCaption(r.caption);
      toast.success('Caption ready', { id: toastId });
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    } finally {
      setCaptionLoading(false);
    }
  };

  const captionFullText = caption
    ? `${caption.text}\n\n${caption.hashtags.map(h => `#${h}`).join(' ')}`
    : '';

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(captionFullText);
      toast.success('Caption copied to clipboard');
    } catch {
      toast.error('Could not copy');
    }
  };

  if (error) return (
    <div className="p-8">
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
    </div>
  );

  if (!data) return (
    <div className="p-8 space-y-6 animate-fade-in">
      <Skeleton className="h-8 w-64" />
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="w-16 rounded-lg" style={{ aspectRatio: '4/5' }} />)}
      </div>
      <div className="grid grid-cols-[1fr_280px] gap-6">
        <Skeleton className="rounded-xl" style={{ aspectRatio: '4/5', maxWidth: 480 }} />
        <Skeleton className="rounded-xl h-96" />
      </div>
    </div>
  );

  if (!data.slides.length) return (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">No slides available for this content.</p>
      <Button variant="ghost" asChild className="mt-4"><Link to="/">← Library</Link></Button>
    </div>
  );

  const totalSlides = data.slides.length;

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="-ml-1 mb-2">
            <Link to="/"><ArrowLeft size={14} />Library</Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight truncate">{data.title || data.topic}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant={data.format === 'carousel' ? 'blue' : 'green'} className="text-[10px] uppercase tracking-wide font-bold">
              {data.format === 'carousel' ? 'Carousel' : 'Single post'}
            </Badge>
            <span className="text-xs text-muted-foreground">{totalSlides} {totalSlides === 1 ? 'slide' : 'slides'}</span>
            {data.framework && <span className="text-xs text-muted-foreground">· {data.framework}</span>}
            {data.angle && <span className="text-xs text-muted-foreground">· {data.angle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={id ? api.library.exportUrl(id) : '#'} className="inline-flex">
            <Button variant="outline" size="sm">
              <FileArchive size={14} />
              Export ZIP
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive border-destructive/30 hover:bg-destructive/5">
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      </div>

      {/* Slide strip */}
      <div className="flex gap-2.5 overflow-x-auto thumb-strip pb-3 mb-6">
        {data.slides.map((s, i) => {
          const src = slideVersions[i] ?? s.imageUrl;
          return (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={cn(
                'relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                active === i ? 'border-primary shadow-md' : 'border-transparent hover:border-border',
              )}
              style={{ width: 64, aspectRatio: '4/5' }}
            >
              <img src={src} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
              <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/60 text-white rounded px-1">
                {i + 1}
              </span>
              {s.editedAt && (
                <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-primary border border-white" title="Edited" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main content layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 280px' }}>
        {/* Slide viewer */}
        <div className="space-y-4">
          {/* Prev/Next navigation */}
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8"
              disabled={active === 0} onClick={() => setActive(a => a - 1)}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm text-muted-foreground flex-1 text-center">
              Slide {active + 1} of {totalSlides}
            </span>
            <Button size="icon" variant="outline" className="h-8 w-8"
              disabled={active === totalSlides - 1} onClick={() => setActive(a => a + 1)}>
              <ChevronRight size={14} />
            </Button>
          </div>

          {/* Image */}
          <div
            className="relative rounded-xl overflow-hidden bg-muted border shadow-sm mx-auto"
            style={{ aspectRatio: '4/5', maxWidth: 480 }}
          >
            {imageUrl ? (
              <img key={imageUrl} src={imageUrl} alt={`Slide ${active + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                No image
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-center flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
              <Code2 size={14} />
              Edit HTML
            </Button>
            <Button variant="outline" size="sm" onClick={() => id && currentSlide && quickAiEdit(id, active, handleSaved(active))}>
              <Sparkles size={14} />
              Edit with AI
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
              <History size={14} />
              History
            </Button>
            {imageUrl && (
              <a href={imageUrl} download={`slide-${active + 1}.png`} className="inline-flex">
                <Button variant="ghost" size="sm">
                  <Download size={14} />
                  PNG
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Metadata panel */}
        <div className="space-y-4">
          {/* Content info */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Content</p>
            <MetaRow label="Topic" value={data.topic} />
            <MetaRow label="Created" value={fmtDate(data.createdAt)} />
            {data.usage?.totalTokens && (
              <MetaRow label="Tokens used" value={data.usage.totalTokens.toLocaleString('en-US')} />
            )}
            {typeof data.cost === 'number' && data.cost > 0 && (
              <MetaRow label="Estimated cost" value={fmtCost(data.cost, data.currency)} />
            )}
            {data.warnings?.research && data.warnings.research.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                {data.warnings.research.length} research warning{data.warnings.research.length === 1 ? '' : 's'}
              </div>
            )}
          </div>

          {/* Slide info */}
          {currentSlide && (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Slide {active + 1}
              </p>
              <MetaRow label="Role" value={currentSlide.role} />
              <MetaRow label="Function" value={currentSlide.narrativeFunction} />
              {currentSlide.designSpec?.recipe && (
                <MetaRow label="Recipe" value={currentSlide.designSpec.recipe} />
              )}
              <MetaRow label="Intent" value={currentSlide.intent} />
              {currentSlide.lastEditSummary && (
                <MetaRow label="Last AI edit" value={currentSlide.lastEditSummary} />
              )}
              {currentSlide.editedAt && (
                <MetaRow label="Edited" value={fmtDate(currentSlide.editedAt)} />
              )}
              {Array.isArray(currentSlide.warnings) && currentSlide.warnings.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  {currentSlide.warnings.length} layout/quality warning{currentSlide.warnings.length === 1 ? '' : 's'}
                </div>
              )}
              {currentSlide.usage && (
                <MetaRow label="Slide tokens" value={currentSlide.usage.totalTokens.toLocaleString('en-US')} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Caption */}
      <div className="mt-8 rounded-xl border bg-card p-5 shadow-sm max-w-3xl">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareText size={16} className="text-primary" />
            <p className="text-sm font-semibold">Instagram caption</p>
          </div>
          <div className="flex items-center gap-2">
            {caption && (
              <Button variant="ghost" size="sm" onClick={copyCaption}>
                <Copy size={13} />
                Copy
              </Button>
            )}
            <Button variant={caption ? 'outline' : 'default'} size="sm" onClick={handleGenerateCaption} disabled={captionLoading}>
              {captionLoading
                ? <Loader2 size={13} className="animate-spin" />
                : caption ? <RefreshCw size={13} /> : <Sparkles size={13} />}
              {caption ? 'Regenerate' : 'Generate caption'}
            </Button>
          </div>
        </div>

        {caption ? (
          <div className="space-y-3">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{caption.text}</p>
            {caption.hashtags.length > 0 && (
              <p className="text-sm text-primary/90 font-medium break-words">
                {caption.hashtags.map(h => `#${h}`).join(' ')}
              </p>
            )}
            <p className="text-xs text-muted-foreground pt-1">Generated on {fmtDate(caption.generatedAt)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate a ready-to-paste caption, with hook, body and hashtags, from the slides' content.
          </p>
        )}
      </div>

      {/* HTML Editor Dialog */}
      {id && currentSlide && (
        <HtmlEditorDialog
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          contentId={id}
          slideIndex={active}
          slideLabel={`Slide ${active + 1} — ${currentSlide.role}`}
          onSaved={handleSaved(active)}
        />
      )}

      {/* Version history dialog */}
      {id && currentSlide && (
        <HistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          contentId={id}
          slideIndex={active}
          slideLabel={`Slide ${active + 1}`}
          onReverted={(imgUrl, editedAt) => handleSaved(active)(imgUrl, editedAt)}
        />
      )}
    </div>
  );
}
