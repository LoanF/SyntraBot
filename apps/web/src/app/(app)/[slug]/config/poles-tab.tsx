'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { deletePole, savePole } from '@/server/config-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, selectClass as select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState, Mono, Panel } from '@/components/page';

type Question = { key: string; label: string; placeholder?: string | undefined; style: 'SHORT' | 'PARAGRAPH'; required: boolean; minLength?: number; maxLength?: number };
export interface PoleRow {
  id: string | null; guildId: string; guildLabel: string; key: string; label: string; emoji: string; description: string; categoryChannelId: string;
  staffRoleIds: string[]; anonymousName: string; channelPattern: string; defaultPriority: string; enabled: boolean; questions: Question[];
}
const PRIORITIES = [['LOW', 'Basse'], ['NORMAL', 'Normale'], ['HIGH', 'Haute'], ['URGENT', 'Urgente']] as const;

export function PolesTab({ slug, rows, guilds, defaultGuildId, rolesByGuild }: { slug: string; rows: PoleRow[]; guilds: { id: string; label: string }[]; defaultGuildId: string; rolesByGuild: Record<string, { id: string; name: string }[]> }) {
  const [editing, setEditing] = useState<PoleRow | null>(null);
  const blank = (): PoleRow => ({ id: null, guildId: defaultGuildId, guildLabel: '', key: '', label: '', emoji: '', description: '', categoryChannelId: '', staffRoleIds: [], anonymousName: '', channelPattern: '', defaultPriority: 'NORMAL', enabled: true, questions: [{ key: 'subject', label: 'Sujet', style: 'SHORT', required: true }] });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="max-w-[60ch] text-[13px] text-muted">Un pôle est une destination de tickets (Staff, Légal, Illégal, Dev, Event…). Il a son formulaire, ses rôles staff et son serveur Discord.</p>
        <Button variant="primary" onClick={() => setEditing(blank())} disabled={guilds.length === 0}><Plus className="size-3.5" aria-hidden />Nouveau pôle</Button>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Aucun pôle" icon={Layers}>Créez un pôle pour que les joueurs puissent ouvrir un ticket depuis un message privé ou un bouton d’embed.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-hover">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-[17px]">{p.emoji || '·'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-fg">{p.label} <Mono className="ml-1">{p.key}</Mono></span>
                    <span className="block truncate text-xs text-subtle">{p.guildLabel} · {p.questions.length} question{p.questions.length > 1 ? 's' : ''} · {p.staffRoleIds.length} rôle{p.staffRoleIds.length > 1 ? 's' : ''} staff</span>
                  </span>
                  {p.enabled ? <Badge tone="success">Actif</Badge> : <Badge>Désactivé</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? `Pôle « ${editing.label} »` : 'Nouveau pôle'} description="Le formulaire (5 questions maximum) s’affiche au joueur dans Discord." side="right" className="sm:w-[34rem]">
          {editing ? <PoleForm key={editing.id ?? 'new'} slug={slug} initial={editing} guilds={guilds} rolesByGuild={rolesByGuild} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PoleForm({ slug, initial, guilds, rolesByGuild, onDone }: { slug: string; initial: PoleRow; guilds: { id: string; label: string }[]; rolesByGuild: Record<string, { id: string; name: string }[]>; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PoleRow>(k: K, val: PoleRow[K]) => setV((s) => ({ ...s, [k]: val }));
  const roles = rolesByGuild[v.guildId];
  const patchQ = (i: number, p: Partial<Question>) => set('questions', v.questions.map((q, k) => (k === i ? { ...q, ...p } : q)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await savePole(slug, { ...v, id: v.id ?? undefined, emoji: v.emoji || undefined, description: v.description || undefined, anonymousName: v.anonymousName || undefined, channelPattern: v.channelPattern || undefined, questions: v.questions.map((q) => ({ ...q, placeholder: q.placeholder || undefined })) });
      if (!res.ok) return setError(res.error);
      toast.success('Pôle enregistré');
      onDone();
    });
  };
  const [confirming, setConfirming] = useState(false);
  const doRemove = () =>
    start(async () => {
      if (!initial.id) return;
      const res = await deletePole(slug, initial.id);
      if (!res.ok) return setError(res.error);
      toast.success('Pôle supprimé');
      onDone();
    });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[5rem_1fr_1fr]">
          <div><Label htmlFor="po-emoji">Emoji</Label><Input id="po-emoji" value={v.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={16} className="text-center" /></div>
          <div><Label htmlFor="po-label">Nom</Label><Input id="po-label" value={v.label} onChange={(e) => set('label', e.target.value)} required maxLength={50} /></div>
          <div><Label htmlFor="po-key">Clé</Label><Input id="po-key" value={v.key} onChange={(e) => set('key', e.target.value.toLowerCase())} required className="font-mono" disabled={Boolean(initial.id)} /></div>
        </div>
        <div><Label htmlFor="po-desc">Description (menu de choix)</Label><Input id="po-desc" value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={100} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="po-guild">Serveur Discord</Label>
            <select id="po-guild" className={select} value={v.guildId} onChange={(e) => { set('guildId', e.target.value); set('staffRoleIds', []); }}>{guilds.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          </div>
          <div><Label htmlFor="po-prio">Priorité par défaut</Label>
            <select id="po-prio" className={select} value={v.defaultPriority} onChange={(e) => set('defaultPriority', e.target.value)}>{PRIORITIES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          </div>
        </div>
        <div>
          <Label>Rôles staff du pôle</Label>
          {roles ? (
            <div role="group" className="max-h-36 overflow-y-auto rounded-md border border-line-strong bg-surface-1 p-1">
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-[13px] text-fg hover:bg-hover">
                  <input type="checkbox" checked={v.staffRoleIds.includes(r.id)} onChange={(e) => set('staffRoleIds', e.target.checked ? [...v.staffRoleIds, r.id] : v.staffRoleIds.filter((x) => x !== r.id))} className="size-3.5 accent-brand-deep" />@ {r.name}
                </label>
              ))}
            </div>
          ) : <Input value={v.staffRoleIds.join(', ')} onChange={(e) => set('staffRoleIds', e.target.value.split(/[,\s]+/).filter(Boolean))} className="font-mono" placeholder="Identifiants séparés par des virgules" />}
          <FieldHint>Voient les salons de ce pôle et peuvent répondre.</FieldHint>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="po-cat">Catégorie des salons</Label><Input id="po-cat" value={v.categoryChannelId} onChange={(e) => set('categoryChannelId', e.target.value)} className="font-mono" placeholder="Identifiant (facultatif)" inputMode="numeric" /></div>
          <div><Label htmlFor="po-anon">Nom des réponses anonymes</Label><Input id="po-anon" value={v.anonymousName} onChange={(e) => set('anonymousName', e.target.value)} placeholder="Équipe Légal" maxLength={60} /></div>
        </div>
        <div><Label htmlFor="po-pat">Nom des salons (surcharge)</Label><Input id="po-pat" value={v.channelPattern} onChange={(e) => set('channelPattern', e.target.value)} className="font-mono" placeholder="Défaut du module Tickets" /><FieldHint>Variables : {'{emoji} {pole} {username} {id}'}</FieldHint></div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="mb-0">Formulaire</Label>
            {v.questions.length < 5 ? <Button type="button" variant="ghost" size="sm" onClick={() => set('questions', [...v.questions, { key: `q${v.questions.length + 1}`, label: '', style: 'SHORT', required: true }])}><Plus className="size-3.5" aria-hidden />Question</Button> : null}
          </div>
          <ul className="space-y-2">
            {v.questions.map((q, i) => (
              <li key={i} className="grid gap-2 rounded-md border border-line bg-surface-2/50 p-2.5 sm:grid-cols-[1fr_7rem_auto]">
                <Input value={q.label} onChange={(e) => patchQ(i, { label: e.target.value })} placeholder="Question (45 caractères max)" maxLength={45} aria-label={`Question ${i + 1}`} />
                <select className={select} value={q.style} onChange={(e) => patchQ(i, { style: e.target.value as Question['style'] })} aria-label={`Type de la question ${i + 1}`}><option value="SHORT">Court</option><option value="PARAGRAPH">Long</option></select>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={q.required} onChange={(e) => patchQ(i, { required: e.target.checked })} className="size-3.5 accent-brand-deep" />Requis</label>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Supprimer la question ${i + 1}`} onClick={() => set('questions', v.questions.filter((_, k) => k !== i))}><Trash2 className="size-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between"><Label className="mb-0 font-normal">Pôle actif (proposé aux joueurs)</Label><Switch checked={v.enabled} onCheckedChange={(c) => set('enabled', c)} /></div>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        {initial.id ? <Button type="button" variant="danger" onClick={() => setConfirming(true)} disabled={pending}>Supprimer</Button> : <span />}
        <div className="flex gap-2"><DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose><Button variant="primary" loading={pending}>Enregistrer</Button></div>
      </div>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Supprimer ce pôle ?" description={`Le pôle « ${initial.label} » ne sera plus proposé aux joueurs. Impossible si des tickets l’utilisent.`} pending={pending} onConfirm={doRemove} />
    </form>
  );
}
