'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { PERMISSIONS, type Permission } from '@syntra/shared';
import { createAccessPolicy, deleteAccessPolicy } from '@/server/actions';
import { ConfirmDialog } from '@/components/confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FieldHint, Input, Label, selectClass as field } from '@/components/ui/input';
import { Mono, Panel } from '@/components/page';
import { cn } from '@/lib/cn';

export interface PolicyRow {
  id: string; roleId: string; roleName: string | null; roleGuild: string; target: string | null; permissions: string[]; label: string | null;
}
type Guild = { id: string; label: string };

const PERM_LABELS: Record<Permission, string> = {
  'project:admin': 'Administrer le projet', 'access:manage': 'Gérer les accès', 'apikeys:manage': 'Gérer les clés API', 'integrations:manage': 'Gérer les intégrations',
  'rcon:execute': 'Exécuter des commandes RCON', 'audit:read': 'Lire le journal d’audit', 'modules:manage': 'Gérer les modules', 'tickets:read': 'Voir les tickets',
  'tickets:write': 'Répondre aux tickets', 'transcripts:read': 'Lire les transcripts', 'reports:read': 'Voir les reports', 'embeds:read': 'Voir les embeds',
  'embeds:write': 'Créer et publier des embeds', 'douane:manage': 'Gérer la douane', 'sync_roles:manage': 'Gérer la synchro des rôles', 'status:manage': 'Gérer le statut serveur',
};
const ALL = Object.keys(PERMISSIONS) as Permission[];

export function AccessClient({ slug, rows, guilds, rolesByGuild, onlyCreate }: { slug: string; rows: PolicyRow[]; guilds: Guild[]; rolesByGuild: Record<string, { id: string; name: string }[]>; onlyCreate?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [toDelete, setToDelete] = useState<PolicyRow | null>(null);
  const remove = () =>
    start(async () => {
      if (!toDelete) return;
      const res = await deleteAccessPolicy(slug, toDelete.id);
      setToDelete(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success('Règle supprimée');
    });

  const create = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary"><Plus className="size-3.5" aria-hidden />Ajouter une règle</Button></DialogTrigger>
      <DialogContent title="Nouvelle règle d’accès" description="Les membres qui détiennent ce rôle Discord obtiennent ces permissions sur la cible choisie." side="right">
        <PolicyForm slug={slug} guilds={guilds} rolesByGuild={rolesByGuild} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );

  if (onlyCreate) return create;
  return (
    <>
      <div className="mb-4 flex justify-end">{create}</div>
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-[14px] font-medium text-fg">{r.roleName ? `@ ${r.roleName}` : <Mono>{r.roleId}</Mono>} <span className="text-xs font-normal text-subtle">sur {r.roleGuild}</span></p>
                <p className="mt-0.5 text-[13px] text-muted">{r.target ? <>Périmètre : <span className="text-fg">{r.target}</span></> : <>Périmètre : <span className="text-fg">projet entier</span></>}{r.label ? ` · ${r.label}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.permissions.map((p) => (
                    <Badge key={p} tone={PERMISSIONS[p as Permission]?.sensitive ? 'warning' : 'neutral'}>
                      {PERMISSIONS[p as Permission]?.sensitive ? <Lock className="size-3" aria-hidden /> : null}
                      {PERM_LABELS[p as Permission] ?? p}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Supprimer la règle" disabled={pending} onClick={() => setToDelete(r)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      </Panel>
      <ConfirmDialog
        open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)} pending={pending} onConfirm={remove}
        title="Supprimer cette règle d’accès ?"
        description={toDelete ? `Les membres ayant le rôle ${toDelete.roleName ? `« ${toDelete.roleName} »` : toDelete.roleId} perdront ces accès immédiatement.` : ''}
      />
    </>
  );
}

function PolicyForm({ slug, guilds, rolesByGuild, onDone }: { slug: string; guilds: Guild[]; rolesByGuild: Record<string, { id: string; name: string }[]>; onDone: () => void }) {
  const [roleGuildId, setRoleGuildId] = useState(guilds[0]?.id ?? '');
  const [roleId, setRoleId] = useState('');
  const [target, setTarget] = useState<string>('project');
  const [perms, setPerms] = useState<Permission[]>([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roles = rolesByGuild[roleGuildId];
  const guildScoped = target !== 'project';

  const choose = (t: string) => { setTarget(t); if (t !== 'project') setPerms((p) => p.filter((x) => !PERMISSIONS[x].sensitive)); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createAccessPolicy(slug, { roleGuildId, discordRoleId: roleId.trim(), targetGuildId: guildScoped ? target : null, permissions: perms, label: label || undefined });
      if (!res.ok) return setError(res.error);
      toast.success('Règle créée');
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-guild">Serveur du rôle</Label>
            <select id="p-guild" className={field} value={roleGuildId} onChange={(e) => { setRoleGuildId(e.target.value); setRoleId(''); }}>
              {guilds.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="p-role">Rôle Discord</Label>
            {roles ? (
              <select id="p-role" className={field} value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                <option value="">Choisir un rôle…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>@ {r.name}</option>)}
              </select>
            ) : (
              <Input id="p-role" className="font-mono" value={roleId} onChange={(e) => setRoleId(e.target.value)} placeholder="Identifiant du rôle" inputMode="numeric" required />
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="p-target">Périmètre</Label>
          <select id="p-target" className={field} value={target} onChange={(e) => choose(e.target.value)}>
            <option value="project">Projet entier (tous les serveurs)</option>
            {guilds.map((g) => <option key={g.id} value={g.id}>Uniquement « {g.label} »</option>)}
          </select>
          <FieldHint>{guildScoped ? 'Limité à ce serveur : les permissions sensibles sont indisponibles.' : 'Les permissions sensibles ne peuvent être accordées qu’ici.'}</FieldHint>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-fg">Permissions</legend>
          <div className="space-y-0.5">
            {ALL.map((p) => {
              const sensitive = PERMISSIONS[p].sensitive;
              const disabled = guildScoped && sensitive;
              return (
                <label key={p} className={cn('flex items-center gap-3 rounded-md px-2.5 py-1.5 text-[13px] transition-colors', disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-hover')}>
                  <input type="checkbox" disabled={disabled} checked={perms.includes(p)} onChange={(e) => setPerms((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} className="size-3.5 accent-brand-deep" />
                  <span className="flex-1 text-fg">{PERM_LABELS[p]}</span>
                  {sensitive ? <Badge tone="warning"><Lock className="size-3" aria-hidden />Sensible</Badge> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="p-label">Note (facultatif)</Label>
          <Input id="p-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Responsables du pôle Illégal" />
        </div>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose>
        <Button variant="primary" loading={pending} disabled={perms.length === 0 || !roleId}>Créer la règle</Button>
      </div>
    </form>
  );
}
