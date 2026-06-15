import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { promises as fs } from 'node:fs';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { SlideDesignSpec } from '@/html/designSpec';
import { log } from '@/lib/log';

export const SlideFixSchema = z.object({
  slideIndex: z.number().int().min(0),
  issue: z.string().min(1),
  fix: z.string().min(1),
});

export const ContentReviewSchema = z.object({
  approved: z.boolean(),
  generalNotes: z.string().nullable(),
  slideFixes: z.array(SlideFixSchema),
});

export type SlideFix = z.infer<typeof SlideFixSchema>;
export type ContentReview = z.infer<typeof ContentReviewSchema>;

/** Per-slide summary the reviewer evaluates, plus the rendered PNG path so the
 * review can SEE every slide and judge the carousel as a whole. */
export interface ReviewableSlide {
  index: number;
  role: string;
  brief: string;
  intent: string;
  designSpec: SlideDesignSpec;
  /** Path to the rendered PNG; attached as an image so the reviewer sees the actual slide. */
  file: string;
}

const REVIEWER_PROMPT = `Sei il caporedattore E direttore artistico finale di Finvestire. Esegui la revisione finale di un contenuto Instagram (singolo post o carosello) già renderizzato. Ricevi l'IMMAGINE di OGNI slide e i suoi metadati: giudichi sia il testo sia la resa visiva, e soprattutto l'INSIEME.

Questo contenuto verrà pubblicato a un pubblico mondiale: lo standard è altissimo. Di default NON approvare; approva solo se è davvero pronto da mostrare al mondo. Nel dubbio, non approvare.

## REVISIONE EDITORIALE (testo + insieme)
1. Aderenza all'argomento e alle istruzioni richieste.
2. Scorrevolezza narrativa: cover che aggancia → sviluppo progressivo → cta che chiude. Nessun salto logico.
3. Qualità e livello: accurato, chiaro, non banale.
4. Coerenza: niente ripetizioni inutili, contraddizioni, salti.
5. Completezza: i punti chiave sono coperti.
6. Aderenza alla ricerca: i dati sono coerenti con il dossier.
7. Forza editoriale: la cover aggancia? La CTA chiude con un invito chiaro e unico (solo nell'ultima slide)?
8. Foreshadowing e loop: cover↔slide 2 coerenti; le tensioni aperte si chiudono; c'è un payoff prima della CTA.

## QUALITÀ EDITORIALE PER-SLIDE (testo + immagine)
9. OBIETTIVO RAGGIUNTO: ogni slide deve avere un obiettivo chiaro nell'arco (agganciare / spiegare un punto / dare la prova / chiudere un loop / invitare) e raggiungerlo. Se non capisci a cosa serve una slide, segnalala.
10. DENSITÀ GIUSTA: né slide vuote/troppo magre (un titolo senza vera spiegazione) né muri di testo. Ogni body deve insegnare qualcosa di completo (mini-headline + spiegazione + eventuale prova). Segnala le slide "carenti di contenuto".
11. NIENTE RIPETIZIONI: nessuna slide rispiega un concetto già dato con parole diverse. Ogni slide aggiunge informazione NUOVA.
12. DATI CON SIGNIFICATO: ogni numero deve dire COS'È (etichetta) e COSA COMUNICA (takeaway). Segnala numeri nudi o di cui non si capisce il senso, e l'accumulo di troppe cifre.
13. REGISTRO E GERGO: linguaggio conversazionale (tu); ogni termine tecnico spiegato o sostituito (pubblico a zero). Segnala gergo non spiegato.
14. EYEBROW/ETICHETTE: gli occhielli sopra il titolo devono essere etichette tematiche reali. Segnala meta-etichette generiche e scollegate tipo "CONTESTO", "OGGETTO DELLA SLIDE", "INVESTIMENTO", "INTRODUZIONE" — vanno chiarite (rese tematiche) o rimosse.

## REVISIONE VISIVA D'INSIEME (guardando le immagini di TUTTE le slide) — PRIORITARIA
15. COERENZA VISIVA DI SERIE: scala tipografica, spaziature, margini, stile dei box e uso del colore COERENTI tra tutte le slide. Segnala chi se ne discosta.
16. RITMO E VARIETÀ: le slide centrali non tutte identiche né monotone, ma della stessa famiglia visiva.
17. ECO COVER↔CTA: la slide finale richiama visivamente la cover.
18. GERARCHIA ED EVIDENZIAZIONI: un solo punto focale per slide; evidenziazioni di PAROLE usate bene — VERDE solo per positivo, ROSSO solo per negativo, mai parola evidenziata a caso o col colore sbagliato. (Nei layout ricchi — griglie, diagrammi, grafici — bordi/superfici colorate e una emoji per nodo sono OK se usate in modo semantico e coerente: il canvas resta bianco. Segnala solo colore/emoji casuali o eccessivi.)
19. SIMMETRIA: in confronti/colonne/grafici le parti devono essere simmetriche (stesso numero di voci, allineamenti e lunghezze comparabili). Segnala asimmetrie.
20. DIFETTI VISIVI PER-SLIDE: collisioni/sovrapposizioni, testo sopra altro testo, numeri/etichette fuori dalla propria box, disallineamenti, testo tagliato, valori che vanno a capo male (es. "%" su riga separata), spazi vuoti accidentali. Anche un solo difetto del genere = carosello non pronto.

Per OGNI slide con un problema (editoriale o visivo) fornisci:
- slideIndex (0-based)
- issue: cosa non va (sii preciso: quale elemento, dove)
- fix: istruzione concreta e azionabile per correggerla (per i difetti visivi indica chiaramente l'aggiustamento di layout necessario)

Output JSON (ContentReview): { approved, generalNotes, slideFixes }
Approva (slideFixes vuoto) SOLO se ogni slide è editorialmente solida E visivamente impeccabile E l'insieme è coerente. Non inventare problemi inesistenti, ma non lasciar passare nulla che non pubblicheresti con orgoglio.`;

export async function reviewContent(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  title: string;
  angle: string;
  slides: ReviewableSlide[];
  meter?: UsageMeter;
}): Promise<ContentReview> {
  const { client, model, reasoningEffort } = args;
  const jsonSchema = zodToJsonSchema(ContentReviewSchema, { name: 'ContentReview', nameStrategy: 'title' });

  const userContent = await buildReviewContent(args);

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: REVIEWER_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ContentReview', strict: true, schema: jsonSchema },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const resp = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('content.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = ContentReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}

/** Assemble the multimodal user content: a header, then per slide its image + metadata. */
async function buildReviewContent(args: {
  topic: string;
  instructions?: string;
  title: string;
  angle: string;
  slides: ReviewableSlide[];
}): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `ARGOMENTO RICHIESTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}TITOLO CONTENUTO: ${args.title}
ANGOLO: ${args.angle}
NUMERO SLIDE: ${args.slides.length}

Di seguito ogni slide: prima i metadati, poi la sua immagine renderizzata.`,
    },
  ];

  for (const s of args.slides) {
    parts.push({
      type: 'text',
      text: `\n### Slide ${s.index} (${s.role})\nBrief: ${s.brief}\nIntent: ${s.intent}\nHeadline: ${s.designSpec.headline.text}\nContenuto: ${s.designSpec.bodyElements.map((b) => b.text).join(' | ')}`,
    });
    const image = await loadImagePart(s.file);
    parts.push(image ?? { type: 'text', text: '[immagine non disponibile per questa slide — valuta da testo]' });
  }

  return parts;
}

async function loadImagePart(file: string): Promise<OpenAI.Chat.ChatCompletionContentPart | null> {
  try {
    const buffer = await fs.readFile(file);
    return {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${buffer.toString('base64')}`, detail: 'high' },
    };
  } catch (err) {
    log.warn('content.review.image_unavailable', { file, reason: (err as Error).message });
    return null;
  }
}
