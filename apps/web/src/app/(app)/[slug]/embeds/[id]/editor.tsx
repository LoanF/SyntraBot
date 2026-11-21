'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Send, Trash2 } from 'lucide-react';
import { embedPayload } from '@syntra/shared';
import { publishEmbed, saveEmbed } from '@/server/actions';
import { DiscordPreview } from '@/components/discord/preview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldHint, Input, Label, Textarea, selectClass as select } from '@/components/ui/input';
import { Panel, PanelHeader } from '@/components/page';
import { cn } from '@/lib/cn';

type Embed = { title?: string; description?: string; color?: string; url?: string; image?: string; thumbnail?: string; footer?: string; fields: { name: string; value: string; inline: boolean }[] };
type Component =
  | { type: 'link'; label: string; url: string }
  | { type: 'auto_role'; label: string; roleId: string; mode: 'toggle' | 'add' }
  | { type: 'open_ticket'; label: string; poleKey: string };
export interface EditorInitial {
  id: string | null;
  name: string;
  channelId: string;
  published: boolean;
  payload: { content?: string; embeds: Embed[]; components: Component[] };
}

const SWATCHES = ['#9057ff', 'var(--brand-light)', '#5865f2', '#3ecf8e', '#f5b544', '#f2555a', '#5aa9ff', '#2b2d31'];

function Counter({ value, max }: { value?: string; max: number }) {
  const n = value?.length ?? 0;
  return <span className={cn('font-mono text-[11px]', n > max ? 'text-danger' : 'text-subtle')}>{n}/{max}</span>;
}

export function EmbedEditor({ slug, guildId, guildLabel, initial, poles, channels, readOnly }: {
  slug: string; guildId: string; guildLabel: string; initial: EditorInitial;
  poles: { key: string; label: string }[]; channels: { id: string; name: string }[] | null; readOnly: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [channelId, setChannelId] = useState(initial.channelId);
  const [content, setContent] = useState(initial.payload.content ?? '');
  const [embeds, setEmbeds] = useState<Embed[]>(initial.payload.embeds);
  const [components, setComponents] = useState<Component[]>(initial.payload.components);
  const [published, setPublished] = useState(initial.published);
  const [dirty, setDirty] = useState(false);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();

  const mark = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const patchEmbed = (i: number, p: Partial<Embed>) => { setEmbeds((es) => es.map((e, k) => (k === i ? { ...e, ...p } : e))); setDirty(true); };
  const patchComponent = (i: number, p: Partial<Component>) => { setComponents((cs) => cs.map((c, k) => (k === i ? ({ ...c, ...p } as Component) : c))); setDirty(true); };

  const payload = useMemo(() => ({ ...(content ? { content } : {}), embeds: embeds.map((e) => ({ ...e, title: e.title || undefined, description: e.description || undefined, url: e.url || undefined, image: e.image || undefined, thumbnail: e.thumbnail || undefined, footer: e.footer || undefined })), components }), [content, embeds, components]);
  const validation = useMemo(() => embedPayload.safeParse(payload), [payload]);
  const errors = validation.success ? [] : validation.error.issues.map((i) => `${i.path.join(' › ')} : ${i.message}`);

  const save = () =>
    new Promise<string | null>((resolve) => {
      startSave(async () => {
        const res = await saveEmbed(slug, { id: id ?? undefined, guildId, name, channelId, payload });
        if (!res.ok) { toast.error(res.error); return resolve(null); }
        setId(res.id); setDirty(false);
        toast.success('Brouillon enregistré');
        if (!id) router.replace(`/${slug}/embeds/${res.id}?g=${guildId}`);
        resolve(res.id);
      });
    });

  const publish = () =>
    startPublish(async () => {
      const savedId = dirty || !id ? await save() : id;
      if (!savedId) return;
      const res = await publishEmbed(slug, savedId);
      if (!res.ok) return void toast.error(res.error);
      setPublished(true);
      toast.success(res.edited ? 'Message modifié en direct sur Discord' : 'Message publié sur Discord');
    });

  // Ctrl/Cmd + S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (!readOnly) void save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addEmbed = () => { setEmbeds((es) => [...es, { title: '', description: '', color: '#9057ff', fields: [] }]); setDirty(true); };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{id ? name : 'Nouvel embed'}</h1>
          <p className="mt-1 text-[13px] text-muted">Serveur « {guildLabel} » · {published ? 'publié sur Discord : « Mettre à jour » modifie le message existant' : 'brouillon, pas encore publié'}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <Badge tone="warning">Modifications non enregistrées</Badge> : null}
          {!readOnly ? (
            <>
              <Button onClick={() => void save()} loading={saving} disabled={!validation.success}>Enregistrer</Button>
              <Button variant="primary" onClick={publish} loading={publishing} disabled={!validation.success || !channelId}>
                <Send className="size-3.5" aria-hidden />
                {published ? 'Mettre à jour sur Discord' : 'Publier sur Discord'}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {/* Sur téléphone : bascule Édition / Aperçu (les deux côte à côte à partir de 1024 px) */}
      <div className="mb-4 flex gap-1 rounded-md border border-line bg-surface-1 p-0.5 lg:hidden" role="tablist" aria-label="Affichage" style={{ width: 'fit-content' }}>
        {(['edit', 'preview'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={mobileView === v} onClick={() => setMobileView(v)} className={cn('rounded px-3 py-1 text-[13px] transition-colors', mobileView === v ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
            {v === 'edit' ? 'Édition' : 'Aperçu Discord'}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- formulaire */}
        <div className={cn('flex min-w-0 flex-col gap-6', mobileView === 'preview' && 'hidden lg:flex')}>
          <fieldset disabled={readOnly} className="contents">
            <Panel>
              <PanelHeader title="Message" />
              <div className="space-y-4 px-4 py-4">
                <div>
                  <Label htmlFor="e-name">Nom interne</Label>
                  <Input id="e-name" value={name} onChange={(e) => mark(setName)(e.target.value)} maxLength={80} />
                </div>
                <div>
                  <Label htmlFor="e-channel">Salon de destination</Label>
                  {channels ? (
                    <select id="e-channel" className={select} value={channelId} onChange={(e) => mark(setChannelId)(e.target.value)}>
                      <option value="">Choisir un salon…</option>
                      {channels.map((c) => <option key={c.id} value={c.id}># {c.name}</option>)}
                    </select>
                  ) : (
                    <Input id="e-channel" value={channelId} onChange={(e) => mark(setChannelId)(e.target.value)} className="font-mono" placeholder="Identifiant du salon" inputMode="numeric" />
                  )}
                  <FieldHint>Le salon doit appartenir à ce serveur Discord.</FieldHint>
                </div>
                <div>
                  <div className="flex items-baseline justify-between"><Label htmlFor="e-content">Texte au-dessus des embeds</Label><Counter value={content} max={2000} /></div>
                  <Textarea id="e-content" value={content} onChange={(e) => mark(setContent)(e.target.value)} rows={3} />
                </div>
              </div>
            </Panel>

            {embeds.map((e, i) => (
              <Panel key={i}>
                <PanelHeader
                  title={embeds.length > 1 ? `Embed ${i + 1}` : 'Embed'}
                  actions={embeds.length > 1 ? <Button variant="ghost" size="icon" aria-label={`Supprimer l’embed ${i + 1}`} onClick={() => { setEmbeds((es) => es.filter((_, k) => k !== i)); setDirty(true); }}><Trash2 className="size-3.5" /></Button> : undefined}
                />
                <div className="space-y-4 px-4 py-4">
                  <div>
                    <div className="flex items-baseline justify-between"><Label htmlFor={`t-${i}`}>Titre</Label><Counter value={e.title} max={256} /></div>
                    <Input id={`t-${i}`} value={e.title ?? ''} onChange={(ev) => patchEmbed(i, { title: ev.target.value })} />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between"><Label htmlFor={`d-${i}`}>Description</Label><Counter value={e.description} max={4096} /></div>
                    <Textarea id={`d-${i}`} value={e.description ?? ''} onChange={(ev) => patchEmbed(i, { description: ev.target.value })} rows={6} />
                    <FieldHint>Markdown Discord : **gras**, *italique*, `code`, &gt; citation, liens.</FieldHint>
                  </div>
                  <div>
                    <Label htmlFor={`c-${i}`}>Couleur</Label>
                    <div className="flex items-center gap-2">
                      <input id={`c-${i}`} type="color" value={/^#[0-9a-f]{6}$/i.test(e.color ?? '') ? e.color : '#9057ff'} onChange={(ev) => patchEmbed(i, { color: ev.target.value })} className="size-8 cursor-pointer rounded-md border border-line-strong bg-surface-1 p-0.5" aria-label="Choisir la couleur" />
                      <Input value={e.color ?? ''} onChange={(ev) => patchEmbed(i, { color: ev.target.value })} className="w-28 font-mono" aria-label="Code couleur hexadécimal" />
                      <div className="flex gap-1">
                        {SWATCHES.map((s) => (
                          <button key={s} type="button" aria-label={`Couleur ${s}`} onClick={() => patchEmbed(i, { color: s })} className={cn('size-5 rounded-full border transition-transform hover:scale-110', e.color === s ? 'border-fg' : 'border-line-strong')} style={{ background: s }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><Label htmlFor={`im-${i}`}>Image</Label><Input id={`im-${i}`} type="url" value={e.image ?? ''} onChange={(ev) => patchEmbed(i, { image: ev.target.value })} placeholder="https://…" /></div>
                    <div><Label htmlFor={`th-${i}`}>Miniature</Label><Input id={`th-${i}`} type="url" value={e.thumbnail ?? ''} onChange={(ev) => patchEmbed(i, { thumbnail: ev.target.value })} placeholder="https://…" /></div>
                    <div><Label htmlFor={`u-${i}`}>Lien du titre</Label><Input id={`u-${i}`} type="url" value={e.url ?? ''} onChange={(ev) => patchEmbed(i, { url: ev.target.value })} placeholder="https://…" /></div>
                    <div><Label htmlFor={`f-${i}`}>Pied de page</Label><Input id={`f-${i}`} value={e.footer ?? ''} onChange={(ev) => patchEmbed(i, { footer: ev.target.value })} /></div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="mb-0">Champs</Label>
                      {e.fields.length < 25 ? <Button variant="ghost" size="sm" onClick={() => patchEmbed(i, { fields: [...e.fields, { name: '', value: '', inline: false }] })}><Plus className="size-3.5" aria-hidden />Ajouter</Button> : null}
                    </div>
                    {e.fields.length === 0 ? <p className="text-xs text-subtle">Aucun champ. Les champs « en ligne » s’affichent par trois.</p> : null}
                    <ul className="space-y-2">
                      {e.fields.map((f, fi) => (
                        <li key={fi} className="grid gap-2 rounded-md border border-line bg-surface-2/50 p-2.5 sm:grid-cols-[1fr_1fr_auto]">
                          <Input value={f.name} onChange={(ev) => patchEmbed(i, { fields: e.fields.map((x, k) => (k === fi ? { ...x, name: ev.target.value } : x)) })} placeholder="Nom" aria-label={`Nom du champ ${fi + 1}`} />
                          <Input value={f.value} onChange={(ev) => patchEmbed(i, { fields: e.fields.map((x, k) => (k === fi ? { ...x, value: ev.target.value } : x)) })} placeholder="Valeur" aria-label={`Valeur du champ ${fi + 1}`} />
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={f.inline} onChange={(ev) => patchEmbed(i, { fields: e.fields.map((x, k) => (k === fi ? { ...x, inline: ev.target.checked } : x)) })} className="size-3.5 accent-brand-deep" />En ligne</label>
                            <Button variant="ghost" size="icon" aria-label={`Supprimer le champ ${fi + 1}`} onClick={() => patchEmbed(i, { fields: e.fields.filter((_, k) => k !== fi) })}><Trash2 className="size-3.5" /></Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Panel>
            ))}
            {embeds.length < 10 ? <Button variant="secondary" onClick={addEmbed}><Plus className="size-3.5" aria-hidden />Ajouter un embed</Button> : null}

            <Panel>
              <PanelHeader title="Boutons" description="Jusqu’à 25 boutons, 5 par ligne" actions={components.length < 25 ? <Button variant="ghost" size="sm" onClick={() => { setComponents((c) => [...c, { type: 'link', label: '', url: '' }]); setDirty(true); }}><Plus className="size-3.5" aria-hidden />Ajouter</Button> : undefined} />
              <div className="px-4 py-4">
                {components.length === 0 ? <p className="text-xs text-subtle">Aucun bouton. Ajoutez un lien, un auto-rôle ou un bouton d’ouverture de ticket.</p> : null}
                <ul className="space-y-2">
                  {components.map((c, i) => (
                    <li key={i} className="grid gap-2 rounded-md border border-line bg-surface-2/50 p-2.5 sm:grid-cols-[9.5rem_1fr_1fr_auto]">
                      <select className={select} value={c.type} aria-label={`Type du bouton ${i + 1}`} onChange={(ev) => {
                        const t = ev.target.value as Component['type'];
                        setComponents((cs) => cs.map((x, k) => (k === i ? (t === 'link' ? { type: 'link', label: x.label, url: '' } : t === 'auto_role' ? { type: 'auto_role', label: x.label, roleId: '', mode: 'toggle' } : { type: 'open_ticket', label: x.label, poleKey: poles[0]?.key ?? '' }) : x)));
                        setDirty(true);
                      }}>
                        <option value="link">Lien</option>
                        <option value="auto_role">Auto-rôle</option>
                        <option value="open_ticket">Ouvrir un ticket</option>
                      </select>
                      <Input value={c.label} onChange={(ev) => patchComponent(i, { label: ev.target.value })} placeholder="Libellé" maxLength={80} aria-label={`Libellé du bouton ${i + 1}`} />
                      {c.type === 'link' ? <Input type="url" value={c.url} onChange={(ev) => patchComponent(i, { url: ev.target.value })} placeholder="https://…" aria-label={`Lien du bouton ${i + 1}`} /> : null}
                      {c.type === 'auto_role' ? <Input value={c.roleId} onChange={(ev) => patchComponent(i, { roleId: ev.target.value })} placeholder="Identifiant du rôle" className="font-mono" inputMode="numeric" aria-label={`Rôle du bouton ${i + 1}`} /> : null}
                      {c.type === 'open_ticket' ? (
                        <select className={select} value={c.poleKey} onChange={(ev) => patchComponent(i, { poleKey: ev.target.value })} aria-label={`Pôle du bouton ${i + 1}`}>
                          {poles.length === 0 ? <option value="">Aucun pôle</option> : null}
                          {poles.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      ) : null}
                      <Button variant="ghost" size="icon" aria-label={`Supprimer le bouton ${i + 1}`} onClick={() => { setComponents((cs) => cs.filter((_, k) => k !== i)); setDirty(true); }}><Trash2 className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </fieldset>
        </div>

        {/* ---------------------------------------------------------------- aperçu */}
        <div className={cn('min-w-0 space-y-3 lg:sticky lg:top-6', mobileView === 'edit' && 'hidden lg:block')}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-fg">Aperçu Discord</h2>
            <span className="text-xs text-subtle">Mis à jour en direct</span>
          </div>
          <DiscordPreview content={content} embeds={embeds.map((e) => ({ ...e }))} components={components} />
          {errors.length > 0 ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
              <p className="font-medium">À corriger avant de publier</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed">{errors.slice(0, 5).map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
