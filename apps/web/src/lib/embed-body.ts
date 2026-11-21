import type { z } from 'zod';
import type { embedPayload } from '@syntra/shared';

const hex = (c?: string) => (c ? parseInt(c.slice(1), 16) : undefined);

/** Conversion du modèle d'embed en corps de message Discord (boutons : lien / auto-rôle / ouverture de ticket). */
export function toDiscordBody(p: z.infer<typeof embedPayload>) {
  const rows: { type: 1; components: Record<string, unknown>[] }[] = [];
  const buttons = p.components.map((c) =>
    c.type === 'link'
      ? { type: 2, style: 5, label: c.label, url: c.url }
      : c.type === 'auto_role'
        ? { type: 2, style: 2, label: c.label, custom_id: `ar:${c.roleId}:${c.mode}` }
        : { type: 2, style: 1, label: c.label, custom_id: `ot:${c.poleKey}` },
  );
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  return {
    ...(p.content ? { content: p.content } : {}),
    embeds: p.embeds.map((e) => ({
      ...(e.title ? { title: e.title } : {}),
      ...(e.description ? { description: e.description } : {}),
      ...(e.color ? { color: hex(e.color) } : {}),
      ...(e.url ? { url: e.url } : {}),
      ...(e.image ? { image: { url: e.image } } : {}),
      ...(e.thumbnail ? { thumbnail: { url: e.thumbnail } } : {}),
      ...(e.footer ? { footer: { text: e.footer } } : {}),
      ...(e.fields.length ? { fields: e.fields } : {}),
    })),
    components: rows,
  } as never;
}
