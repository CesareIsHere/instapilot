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
  <img class="cover__logo" src="{{asset:logo-f}}" alt="Finvestire">
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
  <div class="kpi-hero__number">€ 487.000</div>
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
  <img class="cta-slide__logo" src="{{asset:logo-f}}" alt="Finvestire">
</div>`.trim(),
  },
];

export function buildRecipesBlock(): string {
  return recipes
    .map(
      (r) =>
        `### Recipe: \`${r.id}\`\nWhen to use: ${r.when}\nHTML skeleton:\n\`\`\`html\n${r.skeleton}\n\`\`\``,
    )
    .join('\n\n');
}
