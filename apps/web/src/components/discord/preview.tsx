import { ExternalLink } from 'lucide-react';
import { DiscordMarkdown } from './markdown';
import { LogoMark } from '@/components/brand';

export interface PreviewEmbed {
  title?: string;
  description?: string;
  color?: string;
  url?: string;
  image?: string;
  thumbnail?: string;
  footer?: string;
  fields: { name: string; value: string; inline: boolean }[];
}
export interface PreviewComponent {
  type: 'link' | 'auto_role' | 'open_ticket';
  label: string;
}

/**
 * Simulation d'un message de bot Discord (thème sombre). Les couleurs de ce bloc reprennent volontairement
 * celles de Discord : c'est la fidélité du rendu qui compte ici, pas la charte du dashboard.
 */
export function DiscordPreview({ botName = 'Syntra', content, embeds, components }: { botName?: string; content?: string; embeds: PreviewEmbed[]; components: PreviewComponent[] }) {
  const rows: PreviewComponent[][] = [];
  for (let i = 0; i < components.length; i += 5) rows.push(components.slice(i, i + 5));

  return (
    <div className="rounded-lg bg-[#313338] p-4 font-sans text-[#dbdee1]" aria-label="Aperçu du message dans Discord">
      <div className="flex gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1e1f22]"><LogoMark size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium text-white">{botName}</span>
            <span className="rounded-[3px] bg-[#5865f2] px-1 text-[10px] font-semibold leading-[15px] text-white">BOT</span>
            <span className="ml-1 text-xs text-[#949ba4]">Aujourd’hui à 12:00</span>
          </div>

          {content ? <DiscordMarkdown text={content} className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-[1.375] [&_a]:text-[#00a8fc] [&_code]:bg-[#1e1f22] [&_strong]:text-white" /> : null}

          {embeds.map((e, i) => (
            <article key={i} className="relative mt-1.5 grid max-w-[31rem] overflow-hidden rounded bg-[#2b2d31] pl-1">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: e.color || '#1e1f22' }} />
              <div className="grid gap-2 p-3 pr-4">
                <div className={e.thumbnail ? 'grid grid-cols-[minmax(0,1fr)_5rem] gap-3' : ''}>
                  <div className="min-w-0 space-y-1.5">
                    {e.title ? (
                      e.url ? <a className="block text-[15px] font-semibold text-[#00a8fc] hover:underline">{e.title}</a> : <h4 className="text-[15px] font-semibold text-white">{e.title}</h4>
                    ) : null}
                    {e.description ? <DiscordMarkdown text={e.description} className="whitespace-pre-wrap break-words text-sm leading-[1.375] [&_a]:text-[#00a8fc] [&_code]:bg-[#1e1f22] [&_strong]:text-white" /> : null}
                    {e.fields.length > 0 ? (
                      <div className="grid grid-cols-3 gap-x-4 gap-y-2 pt-1">
                        {e.fields.map((f, fi) => (
                          <div key={fi} className={f.inline ? 'min-w-0' : 'col-span-3 min-w-0'}>
                            <div className="text-sm font-semibold text-white">{f.name}</div>
                            <DiscordMarkdown text={f.value} className="whitespace-pre-wrap break-words text-sm leading-[1.375]" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {e.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.thumbnail} alt="" className="size-20 rounded object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                {e.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image} alt="" className="max-h-72 w-full rounded object-cover" referrerPolicy="no-referrer" />
                ) : null}
                {e.footer ? <div className="text-xs text-[#949ba4]">{e.footer}</div> : null}
              </div>
            </article>
          ))}

          {rows.map((row, ri) => (
            <div key={ri} className="mt-2 flex flex-wrap gap-2">
              {row.map((b, bi) => (
                <span
                  key={bi}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[3px] px-4 text-sm font-medium text-white ${b.type === 'open_ticket' ? 'bg-[#5865f2]' : 'bg-[#4e5058]'}`}
                >
                  {b.label || '…'}
                  {b.type === 'link' ? <ExternalLink className="size-3.5" aria-hidden /> : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
