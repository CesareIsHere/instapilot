import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mountDiscoveryRoutes } from '@/server/routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  mountDiscoveryRoutes(app);
  return app;
}

describe('discovery endpoints', () => {
  it('GET /compositions lists Slide', async () => {
    const res = await request(buildApp()).get('/compositions');
    expect(res.status).toBe(200);
    expect(res.body.compositions[0]).toMatchObject({ id: 'Slide', width: 1080, height: 1350 });
  });

  it('GET /primitives returns all primitive names', async () => {
    const res = await request(buildApp()).get('/primitives');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(expect.arrayContaining(['Headline', 'RichText', 'Illustration', 'Footer']));
  });

  it('GET /layouts returns headline-body-illustration', async () => {
    const res = await request(buildApp()).get('/layouts');
    expect(res.status).toBe(200);
    expect(res.body['headline-body-illustration']).toMatchObject({ slots: ['Headline', 'RichText', 'Illustration'] });
  });

  it('GET /theme returns colors/typography/spacing', async () => {
    const res = await request(buildApp()).get('/theme');
    expect(res.status).toBe(200);
    expect(res.body.colors['brand-navy']).toMatch(/^#/);
  });

  it('GET /assets returns manifest entries', async () => {
    const res = await request(buildApp()).get('/assets');
    expect(res.status).toBe(200);
    expect(res.body['logo-f']).toMatchObject({ path: expect.stringContaining('logo.png') });
  });
});
