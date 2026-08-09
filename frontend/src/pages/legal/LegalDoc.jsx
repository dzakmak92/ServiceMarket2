import React from 'react';

/**
 * Renders a legal document held as data rather than as JSX.
 *
 * The privacy policy, the terms and the imprint are long-form prose with
 * markup inside almost every sentence — a bold defined term, a link to a
 * statute, a line break in an address. Written as JSX that is unavoidable and
 * fine; written as `t('key')` lookups it is not, because half of each sentence
 * ends up outside the key and the four languages drift apart at the seams.
 *
 * So the documents live in `content/` as data, one object per language, and
 * this walks it. The node vocabulary is deliberately tiny — text, bold,
 * italic, link, break — because a legal document needs exactly those and
 * anything more becomes a templating language nobody asked for.
 *
 * No `dangerouslySetInnerHTML`. The content is ours and not user input, so it
 * would be safe today; it would stop being safe the first time somebody wired
 * a CMS to it, and by then the reason it was safe would be forgotten.
 */

function Inline({ node }) {
  if (typeof node === 'string') return node;
  if (node.br) return <br />;
  if (node.b) return <strong>{node.b}</strong>;
  if (node.i) return <em>{node.i}</em>;
  if (node.code) return <code>{node.code}</code>;
  if (node.a) {
    const external = /^https?:/.test(node.href);
    return (
      <a href={node.href}
         {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {node.a}
      </a>
    );
  }
  /* A field the operator still has to supply. Rendered loudly on purpose.
     Three of these sit in the imprint under a heading citing § 5 ECG and § 25
     MedienG — the provisions that require exactly those fields — and they were
     set in the same grey italic as an ordinary aside, which is how they
     survived to a live page. They are not prose and they are not translated:
     a placeholder that reads naturally in four languages is a placeholder
     nobody notices. */
  if (node.todo) {
    return (
      <mark className="bg-amber/25 text-amber-text not-italic font-mono text-[0.85em] px-1 rounded"
            data-testid="legal-placeholder">
        [{node.todo}]
      </mark>
    );
  }
  return null;
}

function Nodes({ nodes }) {
  return (nodes || []).map((n, i) => <Inline key={i} node={n} />);
}

function Block({ block }) {
  if (block.p) return <p><Nodes nodes={block.p} /></p>;
  if (block.lead) return <p className="lead"><Nodes nodes={block.lead} /></p>;
  if (block.note) {
    return (
      <p className="text-sm text-ink-muted italic" data-testid="legal-draft-note">
        <Nodes nodes={block.note} />
      </p>
    );
  }
  if (block.ul) {
    return (
      <ul>
        {block.ul.map((item, i) => <li key={i}><Nodes nodes={item} /></li>)}
      </ul>
    );
  }
  if (block.hr) return <hr className="my-8" />;
  return null;
}

export default function LegalDoc({ doc }) {
  return (
    <>
      {(doc.intro || []).map((b, i) => <Block key={`intro-${i}`} block={b} />)}
      {(doc.sections || []).map((s) => (
        <React.Fragment key={s.id}>
          <h2 id={s.id}>{s.heading}</h2>
          {s.blocks.map((b, i) => <Block key={i} block={b} />)}
        </React.Fragment>
      ))}
    </>
  );
}

/** The sidebar table of contents, in the reader's language. */
export function tocOf(doc) {
  return (doc.sections || [])
    .filter((s) => s.toc !== false)
    .map((s) => ({ id: s.id, label: s.heading }));
}

/**
 * The document in `lang`, falling back to English.
 *
 * English rather than German, and that is not the app's usual rule. Everywhere
 * else German is the source and the fallback, because the catalogue is written
 * in German by tradespeople. These three documents were drafted in English and
 * the other three languages are translations of that draft, so English is what
 * the others were checked against.
 */
export function pick(doc, lang) {
  return doc[lang] || doc.en;
}
