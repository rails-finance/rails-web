// The event-prose engine every family's generator runs on (rails-ops decision
// 0036; ui-jobs 314). A family supplies its strings file
// (content/<family>/event-prose.yaml), its input type and the function that
// picks the template and variant and sets the values; the engine fills the
// placeholders, keeps the template's order, list, groups and alternates, and
// builds the "?" modal from the file. Pure TypeScript with no React, so the
// scripts load it with type stripping.
//
//   const prose = eventProseEngine(file, { links: { faq: FAQ_URLS } });
//   const run = prose.start(prose.template(id), collDecimals);
//   run.values.x = …; run.say("x.what");
//   return { ...prose.finish(run, variant), L5: … };

import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import { ROUNDING, num, type FmtEnv } from "./roundings";
import type {
  EventProseCore,
  EventTemplate,
  ModalData,
  ModalLink,
  ProseFile,
  ProseSeg,
  ProseSentence,
  ProseValue,
  Rounding,
  SentenceTemplate,
  Words,
} from "./types";

export type { FmtEnv } from "./roundings";

const TOKEN = /\{([a-z_0-9]+)(?:\|([a-z_]+))?\}/g;

/** Where a modal's links resolve: `faq` ids through a table in code, `doc`
 *  ids through a table in the file. */
export interface LinkTables {
  faq?: Record<string, string>;
  doc?: Record<string, string>;
}

/** One sentence said, in the template's order, the list apart. */
type Fill<E extends string> = (
  text: string,
  env: FmtEnv,
  emph?: Record<string, E | "bold">,
) => { text: string; segs: ProseSeg<E>[]; uses: string[] };

export class Speaker<E extends string = string> {
  private said = new Map<string, ProseSentence<E>>();
  private t: EventTemplate;
  private env: FmtEnv;
  private sentenceOf: (t: EventTemplate, id: string) => SentenceTemplate;
  private fill: Fill<E>;
  constructor(
    t: EventTemplate,
    env: FmtEnv,
    sentenceOf: (t: EventTemplate, id: string) => SentenceTemplate,
    fill: Fill<E>,
  ) {
    this.t = t;
    this.env = env;
    this.sentenceOf = sentenceOf;
    this.fill = fill;
  }
  say(id: string, emph?: Record<string, E | "bold">): void {
    const s = this.sentenceOf(this.t, id);
    const f = this.fill(s.text, this.env, emph);
    this.said.set(id, { sentence_id: id, text: f.text, uses: f.uses, segs: f.segs });
  }
  /** The sentences said, in the template's order; the list apart. */
  out(): { L4: ProseSentence<E>[]; list: ProseSentence<E>[] } {
    const L4 = this.t.order.filter((id) => this.said.has(id)).map((id) => this.said.get(id)!);
    const list = (this.t.list ?? []).filter((id) => this.said.has(id)).map((id) => this.said.get(id)!);
    return { L4, list };
  }
}

/** A run of the generator over one template. */
export interface ProseRun<K extends string = string, E extends string = string> {
  t: EventTemplate<K>;
  values: Record<string, ProseValue>;
  env: FmtEnv;
  sp: Speaker<E>;
}

export function eventProseEngine<K extends string, E extends string = string>(
  file: ProseFile<K>,
  tables: LinkTables = {},
) {
  const PLACEHOLDERS = file.placeholders;
  const SHARED = file.shared_sentences;
  const BY_ID = new Map(file.templates.map((t) => [t.id, t]));
  const GROUP_RANK = new Map(Object.keys(file.group_words).map((g, i) => [g, i]));

  /** The placeholders a string reads. */
  function placeholdersOf(text: string): { name: string; rounding: Rounding }[] {
    return [...text.matchAll(TOKEN)].map((m) => ({
      name: m[1],
      rounding: (m[2] as Rounding | undefined) ?? PLACEHOLDERS[m[1]]?.rounding ?? "text",
    }));
  }

  /** Fill a string's placeholders. A placeholder the values lack is an error
   *  in the generator, so it throws. */
  function fill(
    text: string,
    env: FmtEnv,
    emph: Record<string, E | "bold"> = {},
  ): { text: string; segs: ProseSeg<E>[]; uses: string[] } {
    const segs: ProseSeg<E>[] = [];
    const uses: string[] = [];
    let at = 0;
    for (const m of text.matchAll(TOKEN)) {
      const i = m.index ?? 0;
      if (i > at) segs.push({ text: text.slice(at, i) });
      const name = m[1];
      const rounding = (m[2] as Rounding | undefined) ?? PLACEHOLDERS[name]?.rounding ?? "text";
      const v = env.values[name];
      if (v === undefined || v === null) throw new Error(`event prose: no value for {${name}} in "${text}"`);
      const out = ROUNDING[rounding](v, name, env);
      const seg: ProseSeg<E> = { text: out, name };
      if (emph[name]) seg.emph = emph[name];
      if (rounding === "ratio_pair")
        seg.pair = { cr: ROUNDING.ratio(v, name, env), ltv: `${(10000 / num(v)).toFixed(2)}%` };
      if (rounding === "manager" || rounding === "address") {
        seg.address = String(v);
        seg.tone = rounding;
      }
      segs.push(seg);
      if (!uses.includes(name)) uses.push(name);
      at = i + m[0].length;
    }
    if (at < text.length) segs.push({ text: text.slice(at) });
    return { text: segs.map((s) => s.text).join(""), segs, uses };
  }

  /** Fill a string's placeholders to text. */
  function fillText(text: string, values: Record<string, ProseValue>, collDecimals: number | null = null): string {
    return fill(text, { values, collDecimals }).text;
  }

  /** A string's text around the named placeholders, the others filled: for a
   *  page that wraps those figures in their receipts. `names` in the order
   *  they appear; the result has one more piece than `names`. */
  function wordsAround(text: string, names: string[], values: Record<string, ProseValue> = {}): string[] {
    const out: string[] = [];
    let rest = text;
    for (const name of names) {
      const at = rest.indexOf(`{${name}}`);
      if (at < 0) throw new Error(`event prose: no {${name}} in "${text}"`);
      out.push(fillText(rest.slice(0, at), values));
      rest = rest.slice(at + name.length + 2);
    }
    out.push(fillText(rest, values));
    return out;
  }

  function template(id: string): EventTemplate<K> {
    const t = BY_ID.get(id);
    if (!t) throw new Error(`event prose: no template ${id}`);
    return t;
  }

  /** A sentence of the template, or a shared one it lists. */
  function sentenceOf(t: EventTemplate, id: string): SentenceTemplate {
    const s = t.sentences[id] ?? (t.order.includes(id) ? SHARED[id] : undefined);
    if (!s) throw new Error(`event prose: ${t.id} has no sentence ${id}`);
    return s;
  }

  /** A short content hash of a template's strings: the manifest's version, so
   *  a regenerated export shows which templates changed. */
  function templateVersion(t: EventTemplate): string {
    const shared = t.order.filter((id) => SHARED[id]).map((id) => SHARED[id].text);
    const src = JSON.stringify([t.title, t.L1, Object.values(t.sentences).map((s) => s.text), shared, t.groups]);
    let h = 2166136261;
    for (let i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  /** The header line from the template's L1 groups and the file's L1 words. */
  function l1Line(t: EventTemplate, values: Record<string, ProseValue>, env: FmtEnv, l1Words: Words): string {
    const groups: string[] = [];
    for (const group of t.L1 ?? []) {
      const words: string[] = [];
      let missing = false;
      for (const p of group) {
        if ("word" in p) {
          words.push(l1Words[p.word]);
          continue;
        }
        const v = values[p.figure];
        if (v == null || (typeof v === "number" && !(Math.abs(v) > 0))) {
          missing = true;
          break;
        }
        let text = ROUNDING[p.rounding ?? PLACEHOLDERS[p.figure]?.rounding ?? "text"](v, p.figure, env);
        if (p.sign) text = `${num(values[`${p.figure}_sign`]) < 0 ? "−" : "+"}${text}`;
        words.push(p.symbol ? `${text} ${values[p.symbol]}` : text);
      }
      if (!missing && words.length) groups.push(words.join(" "));
    }
    return groups.join(" · ");
  }

  /** Begin one event: the template, an empty value table and its speaker. */
  function start(t: EventTemplate<K>, collDecimals: number | null = null): ProseRun<K, E> {
    const values: Record<string, ProseValue> = {};
    const env: FmtEnv = { values, collDecimals };
    return { t, values, env, sp: new Speaker<E>(t, env, sentenceOf, fill) };
  }

  /** The sentences said, each with its group, when the explanation is
   *  grouped: two or more groups hold two or more bullets each (ui-jobs 282).
   *  A grouped explanation heads every group that has a bullet, one-bullet
   *  groups included. Otherwise the sentences come back as said, with no group. */
  function grouped(t: EventTemplate, said: ProseSentence<E>[]): ProseSentence<E>[] {
    const groupOf = new Map<string, string>();
    for (const [g, ids] of Object.entries(t.groups)) for (const id of ids) groupOf.set(id, g);
    const sizes = new Map<string, number>();
    for (const s of said) {
      const g = groupOf.get(s.sentence_id);
      if (g == null) return said;
      sizes.set(g, (sizes.get(g) ?? 0) + 1);
    }
    const draw = [...sizes.values()].filter((n) => n >= 2).length >= 2;
    return draw ? said.map((s) => ({ ...s, group: groupOf.get(s.sentence_id) })) : said;
  }

  /** The run's L4 and list, grouped, with the template's id, variant and version. */
  function finish(
    run: ProseRun<K, E>,
    variant: string,
  ): Pick<EventProseCore<K, E>, "template" | "title" | "L4" | "list" | "values"> {
    const said = run.sp.out();
    const all = grouped(run.t, [...said.L4, ...said.list]);
    return {
      template: { id: run.t.id, variant, version: templateVersion(run.t) },
      title: run.t.title,
      L4: all.slice(0, said.L4.length),
      list: all.slice(said.L4.length),
      values: run.values,
    };
  }

  /** L4 as the explanation prints it: one run with no heading, or one run per
   *  group under its heading, in `group_words` order and the template's order
   *  within each. Payout legs follow the bullets in the flat form and sit in
   *  their group in the grouped one. */
  function explanationRuns(p: { L4: ProseSentence<E>[]; list: ProseSentence<E>[] }): {
    group: string | null;
    heading: string | null;
    sentences: ProseSentence<E>[];
  }[] {
    const all = [...p.L4, ...p.list];
    if (!all.some((s) => s.group)) return all.length ? [{ group: null, heading: null, sentences: all }] : [];
    const runs: { group: string; heading: string; sentences: ProseSentence<E>[] }[] = [];
    for (const s of [...all].sort((a, b) => GROUP_RANK.get(a.group!)! - GROUP_RANK.get(b.group!)!)) {
      const last = runs[runs.length - 1];
      if (last?.group === s.group) last.sentences.push(s);
      else runs.push({ group: s.group!, heading: file.group_words[s.group!], sentences: [s] });
    }
    return runs;
  }

  /** A modal link's URL. */
  function linkUrl(l: ModalLink): string {
    if ("url" in l) return l.url;
    const url = "faq" in l ? tables.faq?.[l.faq] : tables.doc?.[l.doc];
    if (url === undefined) throw new Error(`event prose: no link for ${JSON.stringify(l)}`);
    return url;
  }

  /** A modal as LearnMoreContent: the field forms `form` names where the file
   *  has them (`intro_delegated`, `text_zero_debt`), the first that exists
   *  winning, and the intro's {name}s filled from `values`. */
  function modal(d: ModalData, form: string[] = [], values: Record<string, string> = {}): LearnMoreContent {
    const pick = (o: Record<string, unknown>, field: string): string => {
      for (const f of form) {
        const v = o[`${field}_${f}`];
        if (typeof v === "string") return v;
      }
      return o[field] as string;
    };
    const c: LearnMoreContent = {
      title: d.title,
      intro: fillWords(pick(d as unknown as Record<string, unknown>, "intro"), values),
    };
    if (d.stepsHeading) c.stepsHeading = d.stepsHeading;
    if (d.steps) c.steps = d.steps;
    if (d.extraParagraphs) c.extraParagraphs = d.extraParagraphs;
    if (d.detailsHeading) c.detailsHeading = d.detailsHeading;
    if (d.details)
      c.details = d.details.map((x) => ({
        bold: x.bold,
        text: pick(x, "text"),
        ...(x.sources ? { sources: x.sources.map((l) => ({ label: l.label, url: linkUrl(l) })) } : {}),
      }));
    if (d.video) c.video = d.video;
    if (d.links) c.links = d.links.map((l): LearnMoreLink => ({ label: l.label, url: linkUrl(l) }));
    return c;
  }

  /** The words of one section, read by id: as written, with each {name}
   *  printed as given. */
  function words(section: Words, name: string) {
    const text = (id: string): string => {
      const t = section[id];
      if (t === undefined) throw new Error(`event prose: no ${name}.${id}`);
      return t;
    };
    return {
      text,
      fill: (id: string, values: Record<string, string | number> = {}): string =>
        fillWords(text(id), Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]))),
    };
  }

  return {
    file,
    templates: file.templates,
    placeholdersOf,
    fill,
    fillText,
    wordsAround,
    template,
    sentenceOf,
    templateVersion,
    l1Line,
    start,
    grouped,
    finish,
    explanationRuns,
    linkUrl,
    modal,
    words,
  };
}

/** A string's `{name}`s, each printed as given. */
export function fillWords(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_0-9]+)\}/g, (_, name: string) => {
    const v = values[name];
    if (v === undefined) throw new Error(`event prose: no value for {${name}} in "${text}"`);
    return v;
  });
}
