import { describe, it, expect, vi } from 'vitest';
import { generateSlideCode } from '@/llm/generate';

function makeMockClient(content: string) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content } }],
        })),
      },
    },
  } as unknown as Parameters<typeof generateSlideCode>[0]['client'];
}

describe('generateSlideCode', () => {
  it('returns parsed GeneratedSlide on valid LLM response', async () => {
    const json = JSON.stringify({ intent: 'titolo', code: 'const Slide = () => null;' });
    const client = makeMockClient(json);
    const result = await generateSlideCode({
      client, model: 'm', systemPrompt: 'sys', userPrompt: 'usr',
    });
    expect(result.intent).toBe('titolo');
    expect(result.code).toContain('const Slide');
  });

  it('throws when LLM returns invalid JSON', async () => {
    const client = makeMockClient('not-json');
    await expect(generateSlideCode({
      client, model: 'm', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/llm_invalid_response/);
  });

  it('throws when response missing required fields', async () => {
    const client = makeMockClient(JSON.stringify({ intent: 'x' }));
    await expect(generateSlideCode({
      client, model: 'm', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/llm_invalid_response/);
  });

  it('throws when message content is null', async () => {
    const client = { chat: { completions: { create: vi.fn(async () => ({
      choices: [{ message: { content: null } }],
    })) } } } as unknown as Parameters<typeof generateSlideCode>[0]['client'];
    await expect(generateSlideCode({
      client, model: 'm', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/llm_empty_response/);
  });
});
