import { Fragment, type ReactNode } from 'react';

/**
 * Rendu d'un sous-ensemble sûr du markdown Discord. Aucun HTML brut : tout est construit en nœuds React,
 * donc le contenu des joueurs ne peut jamais injecter de balise (pas de dangerouslySetInnerHTML).
 * Gère : **gras**, *italique*, __souligné__, ~~barré~~, `code`, ```bloc```, > citation, liens, mentions et salons.
 */

export type MentionNames = { users?: Record<string, string>; roles?: Record<string, string>; channels?: Record<string, string> };

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(__[^_\n]+?__)|(~~[^~\n]+?~~)|(\*[^*\n]+?\*)|(_[^_\n]+?_)|(<@!?(\d{15,22})>)|(<@&(\d{15,22})>)|(<#(\d{15,22})>)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(@everyone|@here)/g;

const chip = 'rounded bg-accent-soft px-1 font-medium text-brand';

function inline(text: string, names: MentionNames, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const k = `${key}-${i++}`;
    const [whole] = m;
    if (m[1]) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-px font-mono text-[0.92em] text-fg">{whole.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold text-fg">{inline(whole.slice(2, -2), names, k)}</strong>);
    else if (m[3]) out.push(<u key={k}>{inline(whole.slice(2, -2), names, k)}</u>);
    else if (m[4]) out.push(<s key={k}>{inline(whole.slice(2, -2), names, k)}</s>);
    else if (m[5] || m[6]) out.push(<em key={k}>{inline(whole.slice(1, -1), names, k)}</em>);
    else if (m[8]) out.push(<span key={k} className={chip}>@{names.users?.[m[8]] ?? 'utilisateur'}</span>);
    else if (m[10]) out.push(<span key={k} className={chip}>@{names.roles?.[m[10]] ?? 'rôle'}</span>);
    else if (m[12]) out.push(<span key={k} className={chip}>#{names.channels?.[m[12]] ?? 'salon'}</span>);
    else if (m[13]) out.push(<a key={k} href={whole} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline decoration-brand/40 hover:decoration-brand">{whole}</a>);
    else if (m[14]) out.push(<span key={k} className={chip}>{whole}</span>);
    last = idx + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function DiscordMarkdown({ text, names = {}, className }: { text: string; names?: MentionNames; className?: string }) {
  // Blocs de code ```…``` d'abord, puis lignes (citations "> ")
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className={className}>
      {parts.map((part, pi) => {
        if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
          const body = part.slice(3, -3).replace(/^\w*\n/, '');
          return (
            <pre key={pi} className="my-1 overflow-x-auto rounded-md border border-line bg-surface-2 p-2.5 font-mono text-[12px] leading-relaxed text-fg">
              {body}
            </pre>
          );
        }
        return (
          <Fragment key={pi}>
            {part.split('\n').map((line, li) =>
              line.startsWith('> ') ? (
                <blockquote key={li} className="my-0.5 border-l-2 border-line-strong pl-2.5 text-muted">{inline(line.slice(2), names, `${pi}-${li}`)}</blockquote>
              ) : (
                <Fragment key={li}>
                  {inline(line, names, `${pi}-${li}`)}
                  {li < part.split('\n').length - 1 ? '\n' : null}
                </Fragment>
              ),
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
