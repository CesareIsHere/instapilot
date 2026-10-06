/**
 * Seed a demo carousel into the Library — no API key and no LLM calls needed.
 *
 * The slides are hand-written HTML/CSS (following the same recipes the AI uses),
 * wrapped by the real shell (`buildHtmlDocument`) with your current Brand Kit and
 * rendered by the real Playwright renderer. Handy to explore the Studio before
 * configuring a provider, and to preview how your palette/font/logo look.
 *
 * Usage: npm run seed:demo
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { buildHtmlDocument } from '@/html/template';
import { renderHtmlStill } from '@/html/renderHtml';
import { closeBrowser } from '@/html/browser';
import { readBrandKit, defaultBrandKit } from '@/server/brand';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');
const DEMO_ID = 'carousel-demo';

const BASE_CSS = `
.canvas, .canvas *, .canvas *::before, .canvas *::after { box-sizing: border-box; }
.canvas .s { width: 1080px; height: 1350px; display: flex; flex-direction: column; align-items: center; padding: 56px 72px 160px; font-family: var(--font-family); color: var(--ink); }
.canvas .s__logo { width: 88px; height: 88px; flex-shrink: 0; margin-bottom: 32px; }
.canvas .s__eyebrow { font-size: 26px; font-weight: 700; letter-spacing: 4px; color: var(--muted); text-transform: uppercase; margin-bottom: 24px; text-align: center; }
.canvas .s__title { font-size: 84px; font-weight: 800; line-height: 1.08; color: var(--brand-primary); text-align: center; }
.canvas .pos { color: var(--brand-positive); font-style: italic; }
.canvas .neg { color: var(--danger); font-style: italic; }
.canvas .s__body { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; justify-content: center; }
.canvas .s__note { font-size: 28px; font-weight: 500; color: var(--muted); text-align: center; line-height: 1.4; }
`;

interface DemoSlide {
  role: 'cover' | 'body' | 'cta';
  narrativeFunction: string;
  intent: string;
  bodyHtml: string;
  css: string;
}

const slides: DemoSlide[] = [
  {
    role: 'cover',
    narrativeFunction: 'hook',
    intent: 'Cover: hook sul potere dei piccoli miglioramenti',
    bodyHtml: `
<div class="s">
  <img class="s__logo" src="{{asset:logo}}" alt="logo">
  <div class="s__body">
    <div class="s__eyebrow">Abitudini</div>
    <h1 class="s__title cover__title">Il potere<br>dell'<span class="pos">1%</span></h1>
    <p class="cover__sub">Perché i piccoli passi quotidiani battono i grandi propositi.</p>
  </div>
</div>`,
    css: `
.canvas .cover__title { font-size: 128px; }
.canvas .cover__sub { margin-top: 48px; font-size: 40px; font-weight: 500; line-height: 1.35; text-align: center; color: var(--ink); }`,
  },
  {
    role: 'body',
    narrativeFunction: 'inform',
    intent: 'KPI hero: 37x in un anno',
    bodyHtml: `
<div class="s">
  <img class="s__logo" src="{{asset:logo}}" alt="logo">
  <div class="s__eyebrow">La matematica</div>
  <h2 class="s__title">Un anno di <span class="pos">+1%</span> al giorno</h2>
  <div class="s__body kpi">
    <div class="kpi__number">37×</div>
    <div class="kpi__label">volte meglio rispetto al punto di partenza</div>
    <p class="kpi__context">1,01 elevato a 365 fa circa 37,8. Al contrario, peggiorare dell'1% al giorno ti lascia a <span class="neg">0,03</span>: quasi zero.</p>
  </div>
</div>`,
    css: `
.canvas .kpi { align-items: center; text-align: center; gap: 24px; }
.canvas .kpi__number { font-size: 240px; font-weight: 800; line-height: 1; color: var(--brand-positive); }
.canvas .kpi__label { font-size: 44px; font-weight: 700; color: var(--brand-primary); line-height: 1.2; }
.canvas .kpi__context { font-size: 34px; font-weight: 500; line-height: 1.45; color: var(--ink); max-width: 860px; }`,
  },
  {
    role: 'body',
    narrativeFunction: 'inform',
    intent: 'Progression chart: la crescita non è lineare',
    bodyHtml: `
<div class="s">
  <img class="s__logo" src="{{asset:logo}}" alt="logo">
  <div class="s__eyebrow">Effetto cumulativo</div>
  <h2 class="s__title">All'inizio non vedi <span class="pos">nulla</span></h2>
  <div class="s__body">
    <div class="plot">
      <div class="col"><span class="col__v">1,3×</span><span class="col__bar" style="height:4%"></span><span class="col__x">1 mese</span></div>
      <div class="col"><span class="col__v">2,5×</span><span class="col__bar" style="height:7%"></span><span class="col__x">3 mesi</span></div>
      <div class="col"><span class="col__v">6×</span><span class="col__bar" style="height:16%"></span><span class="col__x">6 mesi</span></div>
      <div class="col"><span class="col__v">15×</span><span class="col__bar" style="height:40%"></span><span class="col__x">9 mesi</span></div>
      <div class="col"><span class="col__v">37×</span><span class="col__bar col__bar--pos" style="height:100%"></span><span class="col__x">12 mesi</span></div>
    </div>
    <p class="s__note">I primi mesi sembrano inutili. Poi la curva accelera.</p>
  </div>
</div>`,
    css: `
.canvas .plot { height: 560px; display: flex; align-items: flex-end; gap: 32px; margin: 40px 0 32px; }
.canvas .col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 12px; }
.canvas .col__v { font-size: 34px; font-weight: 800; color: var(--brand-primary); }
.canvas .col__bar { width: 100%; border-radius: 8px; background: var(--surface-blue); border: 3px solid var(--brand-primary); }
.canvas .col__bar--pos { background: var(--surface-green); border-color: var(--brand-positive); }
.canvas .col__x { font-size: 26px; font-weight: 600; color: var(--muted); }`,
  },
  {
    role: 'body',
    narrativeFunction: 'payoff',
    intent: 'Numbered list: 3 regole pratiche',
    bodyHtml: `
<div class="s">
  <img class="s__logo" src="{{asset:logo}}" alt="logo">
  <div class="s__eyebrow">In pratica</div>
  <h2 class="s__title">3 regole per iniziare <span class="pos">oggi</span></h2>
  <div class="s__body">
    <ol class="list">
      <li class="item"><span class="item__n">01</span><span class="item__t"><b>Rendila minuscola.</b> Due minuti al giorno bastano per partire.</span></li>
      <li class="item"><span class="item__n">02</span><span class="item__t"><b>Agganciala a un'abitudine esistente.</b> Dopo il caffè, prima della doccia.</span></li>
      <li class="item"><span class="item__n">03</span><span class="item__t"><b>Non saltare due volte.</b> Un giorno perso capita, due diventano un'abitudine nuova.</span></li>
    </ol>
  </div>
</div>`,
    css: `
.canvas .list { list-style: none; display: flex; flex-direction: column; gap: 36px; }
.canvas .item { display: flex; gap: 32px; align-items: flex-start; padding: 36px 40px; border: 2px solid var(--brand-primary); border-radius: 16px; background: var(--paper); }
.canvas .item__n { flex-shrink: 0; font-size: 64px; font-weight: 800; line-height: 1; color: var(--brand-positive); }
.canvas .item__t { min-width: 0; font-size: 34px; font-weight: 500; line-height: 1.4; }
.canvas .item__t b { font-weight: 700; color: var(--brand-primary); }`,
  },
  {
    role: 'cta',
    narrativeFunction: 'cta',
    intent: 'CTA: salva e segui',
    bodyHtml: `
<div class="s">
  <img class="s__logo" src="{{asset:logo}}" alt="logo">
  <div class="s__body cta">
    <h2 class="s__title">Non serve fare di più.<br>Serve farlo <span class="pos">ogni giorno</span>.</h2>
    <p class="cta__body">Salva questo post e rileggilo tra 30 giorni.</p>
    <div class="cta__action">Salva · Condividi · Segui</div>
  </div>
</div>`,
    css: `
.canvas .cta { align-items: center; text-align: center; gap: 56px; }
.canvas .cta__body { font-size: 40px; font-weight: 500; line-height: 1.4; }
.canvas .cta__action { font-size: 30px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; color: var(--paper); background: var(--brand-primary); padding: 28px 56px; border-radius: 999px; }`,
  },
];

async function main(): Promise<void> {
  const kit = readBrandKit() ?? defaultBrandKit();
  const colors = { ...defaultBrandKit().brandColors, ...kit.brandColors };
  const dir = path.join(OUTPUT_DIR, DEMO_ID);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const manifestSlides = [];
  for (const [i, s] of slides.entries()) {
    const isLast = i === slides.length - 1;
    const html = buildHtmlDocument(s.bodyHtml.trim(), BASE_CSS + s.css, !isLast, colors, kit.font);
    const base = `slide-${String(i + 1).padStart(2, '0')}`;
    const outcome = await renderHtmlStill(html, base, { force: true, dir, fileName: `${base}.png`, ctaArrow: !isLast });
    if (!outcome.ok) throw new Error(`render failed for ${base}`);
    if (outcome.issues.length) console.warn(`[seed-demo] ${base}: ${outcome.issues.length} layout warning(s)`);
    fs.writeFileSync(path.join(dir, `${base}.html`), html, 'utf8');
    manifestSlides.push({
      index: i, role: s.role, narrativeFunction: s.narrativeFunction,
      file: `${base}.png`, htmlFile: `${base}.html`, intent: s.intent,
    });
  }

  const manifest = {
    carouselId: DEMO_ID,
    topic: "Il potere dell'1%: perché i piccoli miglioramenti quotidiani battono i grandi propositi",
    format: 'carousel',
    framework: 'hook → insight → prova → regole → cta',
    title: "Il potere dell'1%",
    angle: 'Demo generata localmente con `npm run seed:demo` (nessuna chiamata LLM).',
    createdAt: new Date().toISOString(),
    slides: manifestSlides,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[seed-demo] rendered ${slides.length} slides into ${dir}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => closeBrowser());
