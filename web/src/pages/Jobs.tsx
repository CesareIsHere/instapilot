import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, Plus, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, type Job } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { fmtRelative } from '@/lib/utils';
import { cn } from '@/lib/utils';

const PHASES = ['research', 'plan', 'slides', 'review', 'done'];
const PHASE_LABEL: Record<string, string> = {
  research: 'Ricerca', plan: 'Piano', slides: 'Slide', review: 'Revisione', done: 'Completato', queued: 'In coda',
};

function phaseProgress(job: Job): number {
  if (job.status === 'done') return 100;
  if (job.status === 'error') return 100;
  const phase = job.progress.phase;
  const idx = PHASES.indexOf(phase);
  if (idx < 0) return 0;
  const slideOffset = phase === 'slides' && job.progress.current && job.progress.total
    ? job.progress.current / job.progress.total
    : 0.4;
  return Math.round(((idx + slideOffset) / PHASES.length) * 100);
}

function StatusIcon({ status }: { status: Job['status'] }) {
  if (status === 'running') return <Loader2 size={16} className="animate-spin text-amber-500" />;
  if (status === 'done') return <CheckCircle2 size={16} className="text-primary" />;
  return <XCircle size={16} className="text-destructive" />;
}

function JobRow({ job, onRetry }: { job: Job; onRetry: (job: Job) => void }) {
  const phaseTxt = job.status === 'error'
    ? (job.error?.message ?? 'Errore')
    : `${PHASE_LABEL[job.progress.phase] ?? job.progress.phase}${job.progress.detail ? ` — ${job.progress.detail}` : ''}`;

  const formatLabel = job.input.format === 'carousel' ? 'Carosello' : 'Post';

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-xl border bg-card shadow-sm',
      job.status === 'running' && 'border-amber-200',
    )}>
      <StatusIcon status={job.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold truncate">{job.input.topic}</p>
          <Badge variant={job.input.format === 'carousel' ? 'blue' : 'green'} className="shrink-0 text-[10px]">
            {formatLabel}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">{phaseTxt}</p>
        {job.status === 'running' && (
          <Progress value={phaseProgress(job)} className="mt-2 h-1" />
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground hidden sm:block">
          {fmtRelative(job.createdAt)}
        </span>
        {job.status === 'done' && job.contentId && (
          <Button size="sm" asChild>
            <Link to={`/content/${job.contentId}`}>
              Apri <ArrowRight size={13} />
            </Link>
          </Button>
        )}
        {job.status === 'running' && (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/job/${job.id}`}>Dettagli</Link>
          </Button>
        )}
        {job.status === 'error' && (
          <Button size="sm" variant="outline" onClick={() => onRetry(job)}>
            <RefreshCw size={13} />
            Riprova
          </Button>
        )}
      </div>
    </div>
  );
}

export function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const data = await api.generate.list();
      setJobs(data.jobs);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRetry = async (job: Job) => {
    const toastId = toast.loading('Riavvio generazione…');
    try {
      await api.generate.retry(job.id);
      toast.success('Generazione riavviata', { id: toastId });
      load();
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-refresh while any job is running
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (jobs?.some(j => j.status === 'running')) {
      timerRef.current = setInterval(load, 2500);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [jobs]);

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generazioni</h1>
          <p className="text-sm text-muted-foreground mt-1">Storico dei contenuti avviati</p>
        </div>
        <Button asChild>
          <Link to="/new"><Plus size={16} />Nuovo contenuto</Link>
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {jobs === null && !error && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {jobs !== null && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground text-sm">Nessuna generazione avviata.</p>
          <Button asChild className="mt-4">
            <Link to="/new"><Plus size={16} />Avvia la prima generazione</Link>
          </Button>
        </div>
      )}

      {jobs !== null && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map(job => <JobRow key={job.id} job={job} onRetry={handleRetry} />)}
        </div>
      )}
    </div>
  );
}
