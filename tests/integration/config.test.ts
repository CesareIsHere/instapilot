import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mountConfigRoutes } from '@/server/config';
import { errorHandler } from '@/server/errors';

const f = path.join(os.tmpdir(), `cfg-int-${Date.now()}.json`);
process.env.APP_CONFIG_FILE = f;

function app() {
  const a = express();
  a.use(express.json());
  mountConfigRoutes(a);
  a.use(errorHandler);
  return a;
}

afterEach(() => fs.rmSync(f, { force: true }));

describe('config routes', () => {
  it('PUT saves and GET never returns the raw apiKey', async () => {
    const a = app();
    await request(a).put('/api/config').send({ apiKey: 'sk-topsecret99', model: 'gpt-5.4' }).expect(200);

    const get = await request(a).get('/api/config').expect(200);
    expect(get.body).not.toHaveProperty('apiKey');
    expect(get.body.hasApiKey).toBe(true);
    expect(get.body.apiKeyLast4).toBe('et99');
    expect(get.body.model).toBe('gpt-5.4');

    // The key is persisted on disk (so the engine can use it) but not exposed via GET.
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).apiKey).toBe('sk-topsecret99');
  });

  it('rejects unknown fields', async () => {
    const a = app();
    await request(a).put('/api/config').send({ nope: 1 }).expect(400);
  });
});
