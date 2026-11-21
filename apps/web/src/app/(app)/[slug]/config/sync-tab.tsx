'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Users } from 'lucide-react';
import { deleteSyncRule, saveSyncRule } from '@/server/sync-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, selectClass as select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState, Mono, Panel } from '@/components/page';

export interface RuleRow { id: string | null; source: 'JOB' | 'JOB_GRADE' | string; matchValue: string; discordRoleId: string; removeWhenUnmatched: boolean; enabled: boolean }

export function SyncTab({ slug, guildId, guildLabel, rows, roles }: { slug: string; guildId: string; guildLabel: string; rows: RuleRow[]; roles: { id: string; name: string }[] | null }) {
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const roleName = (id: string) => roles?.find((r) => r.id === id)?.name;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="max-w-[64ch] text-[13px] text-muted">Sur « {guildLabel} » : le bot donne ou retire des rôles Discord selon le métier et le grade du joueur en jeu. Le module « Synchro des rôles » doit être activé, et les joueurs liés via le bridge.</p>
        <Button variant="primary" onClick={() => setEditing({ id: null, source: 'JOB', matchValue: '', discordRoleId: '', removeWhenUnmatched: true, enabled: true })}><Plus className="size-3.5" aria-hidden />Nouvelle règle</Button>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Aucune règle de synchronisation" icon={Users}>Exemple : métier <Mono>police</Mono> → rôle « Police ». Utilisez <Mono>police:3+</Mono> pour « grade 3 et au-dessus ».</EmptyState> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setEditing(r)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-hover">
                  <span className="min-w-0 flex-1 text-[14px] text-fg"><Mono className="text-fg">{r.matchValue}</Mono> <span className="text-subtle">→</span> {roleName(r.discordRoleId) ? `@ ${roleName(r.discordRoleId)}` : <Mono>{r.discordRoleId}</Mono>}</span>
                  <Badge>{r.source === 'JOB' ? 'Métier' : 'Métier + grade'}</Badge>
                  {!r.removeWhenUnmatched ? <Badge tone="neutral">Sans retrait</Badge> : null}
                  {!r.enabled ? <Badge tone="warning">Désactivée</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Modifier la règle' : 'Nouvelle règle'}>
          {editing ? <RuleForm key={editing.id ?? 'new'} slug={slug} guildId={guildId} initial={editing} roles={roles} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RuleForm({ slug, guildId, initial, roles, onDone }: { slug: string; guildId: string; initial: RuleRow; roles: { id: string; name: string }[] | null; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveSyncRule(slug, { ...v, id: v.id ?? undefined, guildId });
      if (!res.ok) return setError(res.error);
      toast.success('Règle enregistrée');
      onDone();
    });
  };
  const [confirming, setConfirming] = useState(false);
  const doRemove = () =>
    start(async () => {
      if (!initial.id) return;
      const res = await deleteSyncRule(slug, initial.id);
      if (!res.ok) return setError(res.error);
      toast.success('Règle supprimée');
      onDone();
    });
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="r-src">Condition</Label><select id="r-src" className={select} value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })}><option value="JOB">Métier</option><option value="JOB_GRADE">Métier et grade</option></select></div>
          <div><Label htmlFor="r-val">{v.source === 'JOB' ? 'Métier' : 'Métier:grade'}</Label><Input id="r-val" value={v.matchValue} onChange={(e) => setV({ ...v, matchValue: e.target.value })} className="font-mono" placeholder={v.source === 'JOB' ? 'police' : 'police:3+'} required /></div>
        </div>
        <div>
          <Label htmlFor="r-role">Rôle Discord</Label>
          {roles ? <select id="r-role" className={select} value={v.discordRoleId} onChange={(e) => setV({ ...v, discordRoleId: e.target.value })} required><option value="">Choisir un rôle…</option>{roles.map((r) => <option key={r.id} value={r.id}>@ {r.name}</option>)}</select>
            : <Input id="r-role" value={v.discordRoleId} onChange={(e) => setV({ ...v, discordRoleId: e.target.value })} className="font-mono" inputMode="numeric" placeholder="Identifiant du rôle" required />}
          <FieldHint>Le rôle du bot doit être placé au-dessus de ce rôle dans la hiérarchie Discord.</FieldHint>
        </div>
        <div className="flex items-center justify-between gap-4"><div><Label className="mb-0 font-normal">Retirer le rôle si la condition n’est plus remplie</Label></div><Switch checked={v.removeWhenUnmatched} onCheckedChange={(c) => setV({ ...v, removeWhenUnmatched: c })} /></div>
        <div className="flex items-center justify-between gap-4"><Label className="mb-0 font-normal">Règle active</Label><Switch checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} /></div>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        {initial.id ? <Button type="button" variant="danger" onClick={() => setConfirming(true)} disabled={pending}><Trash2 className="size-3.5" aria-hidden />Supprimer</Button> : <span />}
        <div className="flex gap-2"><DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose><Button variant="primary" loading={pending}>Enregistrer</Button></div>
      </div>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Supprimer ce règle ?" description={`La règle « ${initial.matchValue} » ne sera plus appliquée. Les rôles déjà attribués ne sont pas retirés.`} pending={pending} onConfirm={doRemove} />
    </form>
  );
}
