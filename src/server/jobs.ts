import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import { createLlmClient, readLlmConfig } from '@/llm/client';
import { loadBrandContext } from '@/llm/brandContext';
import { generateContent, type GenerateContentSuccess } from '@/content/orchestrate';
import { log } from '@/lib/log';

export type JobStatus = 'running' | 'done' | 'error';

export interface JobProgress {
  phase: string;
  detail?: string;
  current?: number;
  total?: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  input: { topic: string; format: 'single' | 'carousel'; slideCount: number; instructions?: string; model?: string };
  progress: JobProgress;
  /** Set when status === 'done'. Mirrors the /generate/content response shape. */
  result?: unknown;
  /** Set when status === 'error'. */
  error?: { code?: string; message: string };
}

// In-memory store. Generation artifacts live on disk (output/), so losing the job
// list on restart only loses the transient progress view — the content is in the library.
const jobs = new Map<string, Job>();
const MAX_JOBS = 100;

function now(): string {
  return new Date().toISOString();
}

function pruneJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const ordered = [...jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const j of ordered.slice(0, jobs.size - MAX_JOBS)) jobs.delete(j.id);
}

const GenerateBodySchema = z
  .object({
    topic: z.string().min(1).max(2000),
    instructions: z.string().max(4000).optional(),
    format: z.enum(['single', 'carousel']),
    slideCount: z.number().int().min(1).max(20).optional(),
    brandContext: z.string().optional(),
    model: z.string().optional(),
  })
  .transform((b) => ({
    ...b,
    slideCount: b.format === 'carousel' ? Math.min(9, Math.max(6, b.slideCount ?? 7)) : 1,
  }));

function runJob(job: Job, body: z.infer<typeof GenerateBodySchema>): void {
  // Build the client synchronously but never let it throw out of the (un-awaited)
  // runner: a config error (e.g. missing API key) must mark the job errored, not
  // leave a phantom "running" job in the map.
  let cfg: ReturnType<typeof readLlmConfig>;
  let client: ReturnType<typeof createLlmClient>;
  let brand: string;
  try {
    cfg = readLlmConfig();
    client = createLlmClient(cfg);
    brand = body.brandContext
      ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/contesto-progetto-finvestire.md');
  } catch (err) {
    job.status = 'error';
    job.error = { message: (err as Error).message };
    job.updatedAt = now();
    log.error('job.failed', { id: job.id, message: (err as Error).message });
    return;
  }

  generateContent({
    client,
    model: body.model ?? cfg.model,
    reasoningEffort: cfg.reasoningEffort,
    brandContext: brand,
    topic: body.topic,
    instructions: body.instructions,
    format: body.format,
    slideCount: body.slideCount,
    models: body.model ? undefined : cfg.models,
    onProgress: (p) => {
      job.progress = p;
      job.updatedAt = now();
    },
  })
    .then((result) => {
      if (!result.ok) {
        job.status = 'error';
        job.error = { code: result.code, message: typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail) };
      } else {
        job.status = 'done';
        job.progress = { phase: 'done', detail: 'Completato' };
        job.result = toJobResult(result);
      }
      job.updatedAt = now();
      log.info('job.finished', { id: job.id, status: job.status });
    })
    .catch((err) => {
      job.status = 'error';
      job.error = { message: (err as Error).message };
      job.updatedAt = now();
      log.error('job.failed', { id: job.id, message: (err as Error).message });
    });
}

function toJobResult(result: GenerateContentSuccess) {
  return {
    // Directory basename (e.g. "carousel-ab12" / "post-ab12") — this is the id the
    // library + UI use, NOT the bare hex carouselId.
    contentId: result.carouselDir ? path.basename(result.carouselDir) : undefined,
    carouselId: result.carouselId,
    carouselDir: result.carouselDir,
    topic: result.topic,
    format: result.format,
    title: result.title,
    angle: result.angle,
    framework: result.framework,
    files: result.slides.map((s) => s.file),
    slides: result.slides,
    reviewRounds: result.reviewRounds,
    contentWarnings: result.contentWarnings,
    usage: result.usage,
    durationMs: result.durationMs,
  };
}

/** Public summary (omits the heavy result payload) used in the job list. */
function jobSummary(job: Job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    input: job.input,
    progress: job.progress,
    error: job.error,
    contentId: job.status === 'done' ? (job.result as { contentId?: string } | undefined)?.contentId : undefined,
  };
}

export function mountJobRoutes(app: Express): void {
  app.post('/api/generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = GenerateBodySchema.parse(req.body);
      const id = crypto.randomBytes(6).toString('hex');
      const job: Job = {
        id,
        status: 'running',
        createdAt: now(),
        updatedAt: now(),
        input: {
          topic: body.topic,
          format: body.format,
          slideCount: body.slideCount,
          instructions: body.instructions,
          model: body.model,
        },
        progress: { phase: 'queued', detail: 'In coda' },
      };
      jobs.set(id, job);
      pruneJobs();
      log.info('job.started', { id, topic: body.topic, format: body.format });
      runJob(job, body);
      res.status(202).json(jobSummary(job));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/generate', (_req, res) => {
    const list = [...jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(jobSummary);
    res.json({ jobs: list });
  });

  app.get('/api/generate/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'job_not_found' });
      return;
    }
    res.json({ ...jobSummary(job), result: job.result });
  });

  // Re-run a job with the same input (e.g. after a transient failure). Creates a
  // brand-new job so the original stays in the history.
  app.post('/api/generate/:id/retry', (req: Request, res: Response, next: NextFunction) => {
    try {
      const prev = jobs.get(req.params.id);
      if (!prev) {
        res.status(404).json({ error: 'job_not_found' });
        return;
      }
      const body = GenerateBodySchema.parse({
        topic: prev.input.topic,
        instructions: prev.input.instructions,
        format: prev.input.format,
        slideCount: prev.input.slideCount,
        model: prev.input.model,
      });
      const id = crypto.randomBytes(6).toString('hex');
      const job: Job = {
        id,
        status: 'running',
        createdAt: now(),
        updatedAt: now(),
        input: {
          topic: body.topic,
          format: body.format,
          slideCount: body.slideCount,
          instructions: body.instructions,
          model: body.model,
        },
        progress: { phase: 'queued', detail: 'In coda' },
      };
      jobs.set(id, job);
      pruneJobs();
      log.info('job.retried', { id, from: prev.id, topic: body.topic });
      runJob(job, body);
      res.status(202).json(jobSummary(job));
    } catch (err) {
      next(err);
    }
  });
}
