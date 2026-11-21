import { Gamepad2, Lock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DiscordMarkdown } from './markdown';

export type TranscriptKind = 'player' | 'staff' | 'staff_anon' | 'note' | 'system';

export interface TranscriptMessage {
  id: string;
  kind: TranscriptKind;
  author: string;
  avatar?: string | null;
  content: string;
  at: Date;
  /** Libellé de rôle affiché à côté du nom (ex. nom du pôle pour une réponse anonyme) */
  label?: string;
  origin?: 'game' | 'discord';
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const PALETTE = ['#f2a65a', '#5aa9ff', '#3ecf8e', '#d98cff', '#f2555a', '#e8d44d'];
const colorFor = (name: string) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]!;

function Avatar({ name, src, tone }: { name: string; src?: string | null; tone: TranscriptKind }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full" />;
  }
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-ink" style={{ background: tone === 'player' ? colorFor(name) : tone === 'staff_anon' ? 'var(--text-subtle)' : 'var(--brand-light)' }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const ROLE_BADGE: Record<TranscriptKind, string | null> = { player: 'Joueur', staff: 'Staff', staff_anon: 'Anonyme', note: null, system: null };

/**
 * Conversation rendue comme dans Discord, avec les distinctions propres au support :
 * joueur / réponse staff / réponse anonyme au nom du pôle / note interne (invisible du joueur) / événement système.
 */
export function Transcript({ messages, names }: { messages: TranscriptMessage[]; names?: Parameters<typeof DiscordMarkdown>[0]['names'] }) {
  if (messages.length === 0) return <p className="px-4 py-10 text-center text-[13px] text-subtle">Aucun message enregistré.</p>;

  const items: React.ReactNode[] = [];
  let prev: TranscriptMessage | null = null;

  for (const m of messages) {
    if (!prev || !sameDay(prev.at, m.at)) {
      items.push(
        <div key={`d-${m.id}`} role="separator" className="flex items-center gap-3 px-4 py-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-line" />
          <time dateTime={m.at.toISOString()} className="first-letter:uppercase">{dayFmt.format(m.at)}</time>
          <span className="h-px flex-1 bg-line" />
        </div>,
      );
      prev = null;
    }

    if (m.kind === 'system') {
      items.push(
        <div key={m.id} className="flex items-center gap-2 px-4 py-1.5 text-xs text-subtle">
          <span className="h-px w-3 bg-line" />
          <span>{m.content}</span>
          <time className="font-mono text-[11px]" dateTime={m.at.toISOString()}>{timeFmt.format(m.at)}</time>
        </div>,
      );
      prev = m;
      continue;
    }

    const compact = prev && prev.kind === m.kind && prev.author === m.author && m.at.getTime() - prev.at.getTime() < 5 * 60_000;
    const isNote = m.kind === 'note';

    items.push(
      <article
        key={m.id}
        aria-label={`${m.author}, ${isNote ? 'note interne' : ROLE_BADGE[m.kind]}`}
        className={cn('group relative flex gap-3 px-4', compact ? 'py-0.5' : 'pb-1 pt-3', isNote && 'mx-3 my-1 rounded-md border border-dashed border-warning/40 bg-warning/[0.06] px-3 py-2.5')}
      >
        {compact ? (
          <time className="w-9 shrink-0 pt-1 text-center font-mono text-[10px] text-transparent group-hover:text-subtle" dateTime={m.at.toISOString()}>{timeFmt.format(m.at)}</time>
        ) : isNote ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning"><Lock className="size-4" aria-hidden /></span>
        ) : (
          <Avatar name={m.author} src={m.avatar} tone={m.kind} />
        )}
        <div className="min-w-0 flex-1">
          {!compact ? (
            <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[14px] font-semibold" style={{ color: m.kind === 'player' ? colorFor(m.author) : isNote ? 'var(--warning)' : 'var(--text)' }}>{m.author}</span>
              {isNote ? (
                <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-px text-[11px] font-medium text-warning">Note interne · invisible du joueur</span>
              ) : (
                <span className={cn('rounded px-1.5 py-px text-[11px] font-medium', m.kind === 'player' ? 'bg-surface-3 text-muted' : 'bg-accent-soft text-brand')}>{m.label ?? ROLE_BADGE[m.kind]}</span>
              )}
              {m.origin ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                  {m.origin === 'game' ? <Gamepad2 className="size-3" aria-hidden /> : <MessageSquare className="size-3" aria-hidden />}
                  {m.origin === 'game' ? 'en jeu' : 'Discord'}
                </span>
              ) : null}
              <time className="font-mono text-[11px] text-subtle" dateTime={m.at.toISOString()}>{timeFmt.format(m.at)}</time>
            </header>
          ) : null}
          <DiscordMarkdown text={m.content} names={names ?? {}} className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] text-body" />
        </div>
      </article>,
    );
    prev = m;
  }

  return <div className="pb-3">{items}</div>;
}
