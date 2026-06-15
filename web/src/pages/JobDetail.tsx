import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Job } from '@/lib/api';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PHASES = ['research', 'plan', 'slides', 'review', 'done'];
const PHASE_LABEL: Record<string, string> = {
  research: 'Ricerca', plan: 'Pianificazione', slides: 'Generazione slide', review: 'Revisione editoriale', done: 'Completato',
};
const PHASE_ICON: Record<string, string> = {
  research: '🔍', plan: '📋', slides: '🎨', review: '✅', done: '🎉',
};

function phaseProgress(job: Job): number {
  if (job.status === 'done') return 100;
  if (job.status === 'error') return 100;
  const idx = PHASES.indexOf(job.progress.phase);
  if (idx < 0) return 0;
  const offset = job.progress.phase === 'slides' && job.progress.current && job.progress.total
    ? job.progress.current / job.progress.total
    : 0.4;
  return Math.round(((idx + offset) / PHASES.length) * 100);
}

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const j = await api.generate.get(id);
      setJob(j);
      if (j.status === 'done' && j.contentId) {
        navigate(`/content/${j.contentId}`, { replace: true });
        return;
      }
      if (j.status === 'running') {
        timerRef.current = setTimeout(load, 2000);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [id]);

  const handleRetry = async () => {
    if (!id) return;
    const toastId = toast.loading('Riavvio generazione…');
    try {
      const fresh = await api.generate.retry(id);
      toast.success('Generazione riavviata', { id: toastId });
      navigate(`/job/${fresh.id}`, { replace: true });
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    }
  };

  if (error) return (
    <div className="p-8">
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
    </div>
  );

  if (!job) return (
    <div className="p-8 flex items-center gap-2 text-muted-foreground">
      <Loader2 size={16} className="animate-spin" /> Caricamento…
    </div>
  );

  const pct = phaseProgress(job);
  const curPhaseIdx = PHASES.indexOf(job.progress.phase);

  return (
    <div className="p-8 max-w-xl animate-fade-in">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-1">
        <Link to="/jobs"><ArrowLeft size={14} />Generazioni</Link>
      </Button>

      <div className="space-y-2 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{job.input.topic}</h1>
        <p className="text-sm text-muted-foreground">
          {job.input.format === 'carousel' ? `Carosello · ${job.input.slideCount} slide` : 'Post singolo'}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
        {/* Status icon + message */}
        <div className="flex items-center gap-3">
          {job.status === 'running' && <Loader2 size={20} className="animate-spin text-amber-500 shrink-0" />}
          {job.status === 'done' && <CheckCircle2 size={20} className="text-primary shrink-0" />}
          {job.status === 'error' && <XCircle size={20} className="text-destructive shrink-0" />}
          <div>
            <p className="font-semibold text-sm">
              {job.status === 'error' ? 'Generazione fallita' : (PHASE_LABEL[job.progress.phase] ?? job.progress.phase)}
            </p>
            {job.progress.detail && (
              <p className="text-xs text-muted-foreground mt-0.5">{job.progress.detail}</p>
            )}
            {job.status === 'error' && job.error && (
              <p className="text-xs text-destructive mt-0.5">{job.error.message}</p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <Progress
          value={pct}
          className={cn('h-2', job.status === 'error' && '[&>div]:bg-destructive')}
        />

        {/* Phase steps */}
        <div className="flex justify-between">
          {PHASES.map((p, i) => {
            const past = i < curPhaseIdx;
            const current = i === curPhaseIdx && job.status === 'running';
            const done = job.status === 'done' || past;
            return (
              <div key={p} className="flex flex-col items-center gap-1 text-center w-16">
                <span className={cn(
                  'text-base',
                  (done || current) ? 'opacity-100' : 'opacity-25',
                )}>{PHASE_ICON[p]}</span>
                <span className={cn(
                  'text-[10px] leading-tight',
                  current ? 'font-bold text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/40',
                )}>{PHASE_LABEL[p]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {job.status === 'error' && (
        <div className="mt-4 flex gap-2">
          <Button onClick={handleRetry} className="flex-1">
            <RefreshCw size={14} />
            Riprova generazione
          </Button>
          <Button variant="outline" asChild className="flex-1">
            <Link to="/new">Nuovo contenuto</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
