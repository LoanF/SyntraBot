'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, MoreHorizontal, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { createApiKey, revokeApiKey, rotateApiKey } from '@/server/actions';
import { ConfirmDialog } from '@/components/confirm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/dropdown';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { Mono, Panel, relativeTime } from '@/components/page';

export interface KeyRow {
  id: string; name: string; keyId: string; scopes: string[]; rateLimitPerMin: number;
  createdAt: string; lastUsedAt: string | null; state: 'active' | 'grace' | 'revoked'; graceUntil: string | null;
}
type Scope = { id: string; label: string; help: string };
type Reveal = { keyId: string; secret: string; title: string };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary" size="sm" aria-label={label}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1600); } catch { toast.error('Copie impossible : sélectionnez le texte manuellement.'); }
      }}
    >
      {done ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? 'Copié' : 'Copier'}
    </Button>
  );
}

export function KeysClient({ slug, rows, scopes, onlyCreate }: { slug: string; rows: KeyRow[]; scopes: Scope[]; onlyCreate?: boolean }) {
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [pending, start] = useTransition();

  const rotate = (k: KeyRow) =>
    start(async () => {
      const res = await rotateApiKey(slug, k.id);
      if (!res.ok) return void toast.error(res.error);
      setReveal({ keyId: res.keyId, secret: res.secret, title: 'Clé renouvelée' });
    });
  const [toRevoke, setToRevoke] = useState<KeyRow | null>(null);
  const revoke = () =>
    start(async () => {
      if (!toRevoke) return;
      const res = await revokeApiKey(slug, toRevoke.id);
      setToRevoke(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success('Clé révoquée');
    });

  const createButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus className="size-3.5" aria-hidden />
      Nouvelle clé
    </Button>
  );

  return (
    <>
      {onlyCreate ? createButton : (
        <>
          <div className="mb-4 flex justify-end">{createButton}</div>
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-subtle"><KeyRound className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-fg">{k.name}</span>
                      {k.state === 'active' ? <Badge tone="success">Active</Badge> : k.state === 'grace' ? <Badge tone="warning">Rotation : valide jusqu’à {new Date(k.graceUntil!).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</Badge> : <Badge>Révoquée</Badge>}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                      <Mono>{k.keyId}</Mono>
                      <span>· {k.lastUsedAt ? `utilisée ${relativeTime(new Date(k.lastUsedAt))}` : 'jamais utilisée'}</span>
                      <span>· {k.rateLimitPerMin} req/min</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                  </div>
                  {k.state !== 'revoked' ? (
                    <DropdownMenu>
                      <DropdownTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions pour ${k.name}`} disabled={pending}><MoreHorizontal className="size-4" /></Button>
                      </DropdownTrigger>
                      <DropdownContent align="end" className="w-60">
                        <DropdownItem onSelect={() => rotate(k)}><RefreshCw className="size-3.5 text-muted" aria-hidden />Renouveler (ancienne valide 24 h)</DropdownItem>
                        <DropdownItem onSelect={() => setToRevoke(k)} className="text-danger"><Trash2 className="size-3.5" aria-hidden />Révoquer maintenant</DropdownItem>
                      </DropdownContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <ConfirmDialog
        open={toRevoke !== null} onOpenChange={(o) => !o && setToRevoke(null)} pending={pending} onConfirm={revoke} confirmLabel="Révoquer"
        title={`Révoquer « ${toRevoke?.name ?? ''} » ?`}
        description="Les intégrations qui utilisent cette clé seront immédiatement refusées. Pour un changement sans coupure, utilisez plutôt « Renouveler »."
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="Nouvelle clé API" description="Donnez-lui le nom de l’intégration et seulement les accès nécessaires.">
          <CreateForm slug={slug} scopes={scopes} onCreated={(r) => { setCreating(false); setReveal(r); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={reveal !== null} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent title={reveal?.title ?? 'Clé créée'} description="Copiez le secret maintenant : il ne sera plus jamais affiché.">
          {reveal ? (
            <div className="space-y-4 px-5 py-5">
              <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] leading-snug text-warning">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>Le secret est stocké chiffré et ne peut pas être relu. Si vous le perdez, renouvelez la clé.</p>
              </div>
              <div>
                <Label>Identifiant de clé</Label>
                <div className="flex gap-2"><Input readOnly value={reveal.keyId} className="font-mono" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={reveal.keyId} label="Copier l’identifiant" /></div>
              </div>
              <div>
                <Label>Secret</Label>
                <div className="flex gap-2"><Input readOnly value={reveal.secret} className="font-mono" onFocus={(e) => e.currentTarget.select()} /><CopyButton value={reveal.secret} label="Copier le secret" /></div>
                <FieldHint>En-têtes à envoyer : X-Syntra-Key-Id, X-Syntra-Timestamp, X-Syntra-Nonce, X-Syntra-Signature.</FieldHint>
              </div>
              <div className="flex justify-end"><DialogClose asChild><Button variant="primary">J’ai copié le secret</Button></DialogClose></div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateForm({ slug, scopes, onCreated }: { slug: string; scopes: Scope[]; onCreated: (r: Reveal) => void }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createApiKey(slug, { name, scopes: picked });
      if (!res.ok) return setError(res.error);
      onCreated({ keyId: res.keyId, secret: res.secret, title: 'Clé créée' });
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <Label htmlFor="k-name">Nom</Label>
          <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bridge serveur de jeu" required minLength={2} maxLength={60} autoFocus />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-fg">Accès autorisés</legend>
          <div className="space-y-1">
            {scopes.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2.5 py-2 transition-colors hover:border-line hover:bg-hover">
                <input
                  type="checkbox" checked={picked.includes(s.id)} className="mt-0.5 size-3.5 accent-brand-deep"
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                />
                <span>
                  <span className="block text-[13px] text-fg">{s.label} <Mono className="ml-1">{s.id}</Mono></span>
                  <span className="block text-xs text-subtle">{s.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose>
        <Button variant="primary" loading={pending} disabled={picked.length === 0}>Créer la clé</Button>
      </div>
    </form>
  );
}
