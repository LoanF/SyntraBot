'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Lock, Plus, Tag } from 'lucide-react';
import { deleteStatus, saveStatus } from '@/server/config-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, selectClass as select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState, Mono, Panel } from '@/components/page';

export interface StatusRow { id: string | null; key: string; label: string; emoji: string; color: string; trigger: string; lockAutoChange: boolean; isTerminal: boolean; tickets?: number }
const TRIGGERS = [
  ['ON_CREATE', 'À l’ouverture du ticket'],
  ['ON_USER_REPLY', 'Quand le joueur répond'],
  ['ON_STAFF_REPLY', 'Quand le staff répond'],
  ['MANUAL_ONLY', 'Manuel uniquement'],
] as const;
const triggerLabel = (t: string) => TRIGGERS.find(([id]) => id === t)?.[1] ?? t;

export function StatusesTab({ slug, rows }: { slug: string; rows: StatusRow[] }) {
  const [editing, setEditing] = useState<StatusRow | null>(null);
  const blank: StatusRow = { id: null, key: '', label: '', emoji: '🔵', color: '#5aa9ff', trigger: 'MANUAL_ONLY', lockAutoChange: false, isTerminal: false };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="max-w-[62ch] text-[13px] text-muted">Les pastilles préfixent le nom du salon. Un statut peut se déclencher automatiquement ; verrouillé, il n’est jamais remplacé tout seul.</p>
        <Button variant="primary" onClick={() => setEditing(blank)}><Plus className="size-3.5" aria-hidden />Nouveau statut</Button>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Aucun statut" icon={Tag}>Sans statut, les tickets ne peuvent pas être ouverts.</EmptyState> : (
          <ul className="divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-hover">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-[17px]">{s.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-fg"><span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />{s.label}<Mono>{s.key}</Mono></span>
                    <span className="block text-xs text-subtle">{triggerLabel(s.trigger)}{s.tickets ? ` · ${s.tickets} ticket${s.tickets > 1 ? 's' : ''}` : ''}</span>
                  </span>
                  {s.lockAutoChange ? <Badge><Lock className="size-3" aria-hidden />Verrouillé</Badge> : null}
                  {s.isTerminal ? <Badge tone="neutral">Final</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? `Statut « ${editing.label} »` : 'Nouveau statut'} description="Un seul statut par déclencheur automatique.">
          {editing ? <StatusForm key={editing.id ?? 'new'} slug={slug} initial={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusForm({ slug, initial, onDone }: { slug: string; initial: StatusRow; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof StatusRow>(k: K, val: StatusRow[K]) => setV((s) => ({ ...s, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveStatus(slug, { id: v.id ?? undefined, key: v.key, label: v.label, emoji: v.emoji, color: v.color, trigger: v.trigger, lockAutoChange: v.lockAutoChange, isTerminal: v.isTerminal });
      if (!res.ok) return setError(res.error);
      toast.success('Statut enregistré');
      onDone();
    });
  };
  const [confirming, setConfirming] = useState(false);
  const doRemove = () =>
    start(async () => {
      if (!initial.id) return;
      const res = await deleteStatus(slug, initial.id);
      if (!res.ok) return setError(res.error);
      toast.success('Statut supprimé');
      onDone();
    });

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[5rem_1fr_1fr]">
          <div><Label htmlFor="s-emoji">Pastille</Label><Input id="s-emoji" value={v.emoji} onChange={(e) => set('emoji', e.target.value)} required maxLength={16} className="text-center" /></div>
          <div><Label htmlFor="s-label">Libellé</Label><Input id="s-label" value={v.label} onChange={(e) => set('label', e.target.value)} required maxLength={40} /></div>
          <div><Label htmlFor="s-key">Clé</Label><Input id="s-key" value={v.key} onChange={(e) => set('key', e.target.value.toLowerCase())} required className="font-mono" disabled={Boolean(initial.id)} /></div>
        </div>
        <div>
          <Label htmlFor="s-color">Couleur</Label>
          <div className="flex items-center gap-2">
            <input id="s-color" type="color" value={v.color} onChange={(e) => set('color', e.target.value)} className="size-8 cursor-pointer rounded-md border border-line-strong bg-surface-1 p-0.5" aria-label="Choisir la couleur" />
            <Input value={v.color} onChange={(e) => set('color', e.target.value)} className="w-28 font-mono" aria-label="Code couleur hexadécimal" />
          </div>
        </div>
        <div>
          <Label htmlFor="s-trigger">Déclencheur</Label>
          <select id="s-trigger" className={select} value={v.trigger} onChange={(e) => set('trigger', e.target.value)}>{TRIGGERS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        </div>
        <div className="flex items-center justify-between gap-4"><div><Label className="mb-0 font-normal">Verrouiller</Label><FieldHint>Ne jamais être remplacé automatiquement.</FieldHint></div><Switch checked={v.lockAutoChange} onCheckedChange={(c) => set('lockAutoChange', c)} /></div>
        <div className="flex items-center justify-between gap-4"><div><Label className="mb-0 font-normal">Statut final</Label><FieldHint>Utilisé à la clôture d’un ticket.</FieldHint></div><Switch checked={v.isTerminal} onCheckedChange={(c) => set('isTerminal', c)} /></div>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        {initial.id ? <Button type="button" variant="danger" onClick={() => setConfirming(true)} disabled={pending}>Supprimer</Button> : <span />}
        <div className="flex gap-2"><DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose><Button variant="primary" loading={pending}>Enregistrer</Button></div>
      </div>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Supprimer ce statut ?" description={`Le statut « ${initial.label} » sera supprimé. Les tickets existants ne sont pas modifiés.`} pending={pending} onConfirm={doRemove} />
    </form>
  );
}
