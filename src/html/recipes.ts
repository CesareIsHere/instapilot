export interface Recipe {
  id: string;
  when: string;
  skeleton: string;
}

export const recipes: Recipe[] = [
  {
    id: 'cover',
    when: 'Opening/hook slide — eyebrow label + dominant hero title + optional subtitle + logo at top or bottom.',
    skeleton: `
<div class="cover">
  <div class="cover__eyebrow">CATEGORY LABEL</div>
  <h1 class="cover__title">The main hook in<br><span class="accent">two lines max</span></h1>
  <p class="cover__subtitle">Supporting sentence, optional</p>
  <img class="cover__logo" src="{{asset:logo}}" alt="Brand logo">
</div>`.trim(),
  },
  {
    id: 'numbered-list',
    when: 'Ordered steps, rules, or ranked points (3–6 items). Number is the visual anchor.',
    skeleton: `
<div class="list-slide">
  <h2 class="list-slide__title">Title</h2>
  <ol class="list-slide__items">
    <li class="list-item"><span class="list-item__num">01</span><span class="list-item__text">First point with enough detail to be useful</span></li>
    <li class="list-item"><span class="list-item__num">02</span><span class="list-item__text">Second point</span></li>
    <li class="list-item"><span class="list-item__num">03</span><span class="list-item__text">Third point</span></li>
  </ol>
</div>`.trim(),
  },
  {
    id: 'compare-2col',
    when: 'Side-by-side comparison: before/after, A vs B, two approaches, two timeframes.',
    skeleton: `
<div class="compare">
  <h2 class="compare__title">Title</h2>
  <div class="compare__cols">
    <div class="compare__col compare__col--left">
      <div class="compare__col-label">LEFT LABEL</div>
      <ul class="compare__points">
        <li>Point one</li>
        <li>Point two</li>
      </ul>
    </div>
    <div class="compare__divider"></div>
    <div class="compare__col compare__col--right">
      <div class="compare__col-label">RIGHT LABEL</div>
      <ul class="compare__points">
        <li>Point one</li>
        <li>Point two</li>
      </ul>
    </div>
  </div>
</div>`.trim(),
  },
  {
    id: 'kpi-hero',
    when: 'A single dominant number or statistic is the focal point. Everything else provides context.',
    skeleton: `
<div class="kpi-hero">
  <div class="kpi-hero__eyebrow">CONTEXT LABEL</div>
  <div class="kpi-hero__number">73%</div>
  <div class="kpi-hero__label">What this number means</div>
  <p class="kpi-hero__context">One or two sentences of supporting context. Keep it short.</p>
</div>`.trim(),
  },
  {
    id: 'card-grid-2x2',
    when: '4 parallel concepts, indicators, or metrics shown with equal visual weight in a 2×2 grid.',
    skeleton: `
<div class="card-grid">
  <h2 class="card-grid__title">Title</h2>
  <div class="card-grid__grid">
    <div class="card"><div class="card__label">LABEL</div><div class="card__value">Value</div><div class="card__desc">Short description</div></div>
    <div class="card"><div class="card__label">LABEL</div><div class="card__value">Value</div><div class="card__desc">Short description</div></div>
    <div class="card"><div class="card__label">LABEL</div><div class="card__value">Value</div><div class="card__desc">Short description</div></div>
    <div class="card"><div class="card__label">LABEL</div><div class="card__value">Value</div><div class="card__desc">Short description</div></div>
  </div>
</div>`.trim(),
  },
  {
    id: 'card-grid',
    when: 'Several parallel concepts/metrics (3–6) shown with equal weight. Use 3 cols × N rows. Each card: a label + a short explanation (a value is optional). Cards may use distinct accent borders + light surface fills to tell them apart.',
    skeleton: `
<div class="grid-slide">
  <div class="grid-slide__eyebrow">TOPICAL LABEL</div>
  <h1 class="grid-slide__title">Hook headline</h1>
  <p class="grid-slide__subtitle">One sentence that frames what these cards are and how to read them.</p>
  <div class="grid-slide__grid"><!-- repeat 3–6 cards; cycle the accent classes for variety -->
    <div class="gcard gcard--primary"><div class="gcard__label">Concept A</div><p class="gcard__desc">What it measures, in one plain line.</p><p class="gcard__desc">A second short note if useful.</p></div>
    <div class="gcard gcard--positive"><div class="gcard__label">Concept B</div><p class="gcard__desc">…</p></div>
    <div class="gcard gcard--amber"><div class="gcard__label">Concept C</div><p class="gcard__desc">…</p></div>
  </div>
</div>`.trim(),
  },
  {
    id: 'concept-breakdown',
    when: 'Unpack ONE concept with supporting boxes: a definition box + a formula/breakdown box + an optional glossary box. Great for "what is X" explainers.',
    skeleton: `
<div class="concept">
  <h1 class="concept__title">Finally understand <span class="accent-positive">X</span></h1>
  <div class="concept__boxes">
    <div class="concept__box concept__box--blue"><div class="concept__box-title">What is X?</div><p>Plain-language definition in 1–2 lines.</p></div>
    <div class="concept__box concept__box--gray"><div class="concept__box-title">How it works</div><p>A + B + C = X (one line per term).</p></div>
    <div class="concept__box concept__box--positive"><div class="concept__box-title">In short</div><p>The single takeaway.</p></div>
  </div>
</div>`.trim(),
  },
  {
    id: 'flow-diagram',
    when: 'A process / how-it-works flow with ordered steps (3–6). Nodes stacked vertically (or a branch row) connected by arrows. Optionally a small emoji icon per node. Position:absolute / SVG is allowed here for connectors.',
    skeleton: `
<div class="flow">
  <h1 class="flow__title">How <span class="accent-positive">X</span> works</h1>
  <ol class="flow__steps">
    <li class="flow__node flow__node--blue"><span class="flow__icon">💰</span><div><div class="flow__node-title">Step 1 — short label</div><p class="flow__node-desc">One line explaining the step.</p></div></li>
    <li class="flow__arrow" aria-hidden="true">↓</li>
    <li class="flow__node flow__node--violet"><span class="flow__icon">👤</span><div><div class="flow__node-title">Step 2</div><p class="flow__node-desc">…</p></div></li>
    <li class="flow__arrow" aria-hidden="true">↓</li>
    <li class="flow__node flow__node--positive"><span class="flow__icon">✅</span><div><div class="flow__node-title">Step 3 — outcome</div><p class="flow__node-desc">…</p></div></li>
  </ol>
</div>`.trim(),
  },
  {
    id: 'bar-chart',
    when: 'Compare discrete quantities or rank options (e.g. time spent per activity, cost of A vs B vs C). Horizontal bars: each row is a category label + a proportional bar + its value. Bar widths are proportional to the values (the largest ≈ 100%). Always show the value on every bar.',
    skeleton: `
<div class="chart">
  <div class="chart__eyebrow">TOPICAL LABEL</div>
  <h1 class="chart__title">Hook headline</h1>
  <p class="chart__subtitle">One line saying what the chart compares and the unit.</p>
  <ul class="chart__bars">
    <li class="chart__row"><span class="chart__cat">Option A</span><span class="chart__track"><span class="chart__bar chart__bar--positive" style="width:100%"></span></span><span class="chart__val">78%</span></li>
    <li class="chart__row"><span class="chart__cat">Option B</span><span class="chart__track"><span class="chart__bar chart__bar--primary" style="width:42%"></span></span><span class="chart__val">33%</span></li>
    <li class="chart__row"><span class="chart__cat">Option C</span><span class="chart__track"><span class="chart__bar chart__bar--primary" style="width:12%"></span></span><span class="chart__val">9%</span></li>
  </ul>
  <p class="chart__note">Source / one-line takeaway.</p>
</div>`.trim(),
  },
  {
    id: 'progression-chart',
    when: 'Show growth / accumulation OVER TIME (a habit compounding, a skill improving, a number building up). Vertical rising bars, one per time milestone, heights proportional to the value; highlight the final bar. Label each bar with its year and value. Ideal for "time makes it grow".',
    skeleton: `
<div class="growth">
  <div class="growth__eyebrow">TOPICAL LABEL</div>
  <h1 class="growth__title">Hook headline</h1>
  <div class="growth__plot"><!-- fixed-height plot; columns align to the bottom -->
    <div class="growth__col"><span class="growth__v">10k</span><span class="growth__bar" style="height:12%"></span><span class="growth__x">Year 1</span></div>
    <div class="growth__col"><span class="growth__v">28k</span><span class="growth__bar" style="height:34%"></span><span class="growth__x">Year 5</span></div>
    <div class="growth__col"><span class="growth__v">55k</span><span class="growth__bar" style="height:62%"></span><span class="growth__x">Year 10</span></div>
    <div class="growth__col"><span class="growth__v">100k</span><span class="growth__bar growth__bar--positive" style="height:100%"></span><span class="growth__x">Year 18</span></div>
  </div>
  <p class="growth__note">One line: what the trend means.</p>
</div>`.trim(),
  },
  {
    id: 'breakdown-chart',
    when: 'Show proportions or a step-down breakdown with bars (e.g. total → after step 1 → after step 2 → what is left). Horizontal bars whose WIDTHS are proportional (use width:NN% of the row, never viewport units). Positive accent = what remains, negative accent = what is subtracted; label every bar with what it is and its value.',
    skeleton: `
<div class="bars">
  <div class="bars__eyebrow">TOPICAL LABEL</div>
  <h1 class="bars__title">Hook headline</h1>
  <ul class="bars__list">
    <li class="bars__row"><span class="bars__label">Total</span><span class="bars__track"><span class="bars__fill bars__fill--positive" style="width:100%"></span></span><span class="bars__value">100</span></li>
    <li class="bars__row"><span class="bars__label">After step 1</span><span class="bars__track"><span class="bars__fill bars__fill--positive" style="width:62%"></span><span class="bars__fill bars__fill--negative" style="width:38%"></span></span><span class="bars__value">62</span></li>
    <li class="bars__row"><span class="bars__label">After step 2</span><span class="bars__track"><span class="bars__fill bars__fill--positive" style="width:40%"></span><span class="bars__fill bars__fill--negative" style="width:22%"></span></span><span class="bars__value">40</span></li>
  </ul>
  <p class="bars__note">One line stating what the breakdown shows.</p>
</div>`.trim(),
  },
  {
    id: 'quote',
    when: 'A single quote, principle, or framework statement from a known figure or source.',
    skeleton: `
<div class="quote-slide">
  <div class="quote-slide__mark">"</div>
  <blockquote class="quote-slide__text">The quote text goes here, kept to 1–3 lines.</blockquote>
  <div class="quote-slide__attribution">— Author, Source</div>
</div>`.trim(),
  },
  {
    id: 'cta',
    when: 'Final slide: call-to-action, recap hook, or follow prompt. Should feel conclusive.',
    skeleton: `
<div class="cta-slide">
  <h2 class="cta-slide__title">Closing headline</h2>
  <p class="cta-slide__body">One-sentence reinforcement or invitation to act.</p>
  <div class="cta-slide__action">FOLLOW / SAVE / SHARE</div>
  <img class="cta-slide__logo" src="{{asset:logo}}" alt="Brand logo">
</div>`.trim(),
  },
];

export function buildRecipesBlock(brandName = 'the brand'): string {
  return recipes
    .map(
      (r) =>
        `### Recipe: \`${r.id}\`\nWhen to use: ${r.when}\nHTML skeleton:\n\`\`\`html\n${r.skeleton.replaceAll('{{brandName}}', brandName)}\n\`\`\``,
    )
    .join('\n\n');
}
