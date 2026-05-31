/** Raw usage object as returned by either the Chat Completions API
 * (prompt_tokens/completion_tokens) or the Responses API (input_tokens/output_tokens). */
export interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface UsageRecord extends UsageTotals {
  label: string;
}

const ZERO: UsageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };

/** Accumulates token usage across LLM calls in a single pipeline run.
 * Designed so a future price table is a pure multiplication over UsageTotals. */
export class UsageMeter {
  private _records: UsageRecord[] = [];

  /** Record usage from a raw LLM response.usage object (either API shape). */
  record(label: string, usage?: RawUsage | null): void {
    const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
    this._records.push({ label, promptTokens, completionTokens, totalTokens, calls: 1 });
  }

  /** Record a pre-aggregated UsageTotals (e.g. rolling a per-slide total into a carousel total). */
  recordTotals(label: string, totals: UsageTotals): void {
    this._records.push({ label, ...totals, calls: 1 });
  }

  get records(): UsageRecord[] {
    return [...this._records];
  }

  get totals(): UsageTotals {
    return this._records.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.promptTokens,
        completionTokens: acc.completionTokens + r.completionTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
        calls: acc.calls + 1,
      }),
      { ...ZERO },
    );
  }

  /** Usage aggregated per label (multiple calls with the same label are summed). */
  get breakdown(): UsageRecord[] {
    const map = new Map<string, UsageRecord>();
    for (const r of this._records) {
      const existing = map.get(r.label);
      if (existing) {
        existing.promptTokens += r.promptTokens;
        existing.completionTokens += r.completionTokens;
        existing.totalTokens += r.totalTokens;
        existing.calls += 1;
      } else {
        map.set(r.label, { ...r });
      }
    }
    return [...map.values()];
  }
}
