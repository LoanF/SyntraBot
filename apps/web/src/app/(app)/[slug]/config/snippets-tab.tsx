'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { MessageSquareText, Plus } from 'lucide-react';
import { deleteSnippet, saveSnippet } from '@/server/config-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Textarea, selectClass as select } from '@/components/ui/input';
import { EmptyState, Mono, Panel } from '@/components/page';

export interface SnippetRow { id: string | null; key: string; title: string; content: string; poleId: string | null }

export function SnippetsTab({ slug, rows, poles }: { slug: string; rows: SnippetRow[]; poles: { id: string; label: string }[] }) {
  const [editing, setEditing] = useState<SnippetRow | null>(null);
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="max-w-[62ch] text-[13px] text-muted">Réponses pré-enregistrées que le staff envoie avec <Mono>/ticket snippet</Mono>.</p>
        <Button variant="primary" onClick={() => setEditing({ id: null, key: '', title: '', content: '', poleId: null })}><Plus className="size-3.5" aria-hidden />Nouvelle réponse</Button>
      </div>
      <Panel className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Aucune réponse rapide" icon={MessageSquareText}>Ajoutez les réponses que votre staff envoie souvent : accusé de réception, demande de preuves…</EmptyState> : (
          <ul className="divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="block w-full px-4 py-3 text-left transition-colors hover:bg-hover">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-fg">{s.title}<Mono>{s.key}</Mono>{s.poleId ? <Badge>{poles.find((p) => p.id === s.poleId)?.label ?? 'Pôle'}</Badge> : null}</span>
                  <span className="mt-0.5 line-clamp-2 text-[13px] text-muted">{s.content}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Modifier la réponse' : 'Nouvelle réponse rapide'}>
          {editing ? <SnippetForm key={editing.id ?? 'new'} slug={slug} initial={editing} poles={poles} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SnippetForm({ slug, initial, poles, onDone }: { slug: string; initial: SnippetRow; poles: { id: string; label: string }[]; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveSnippet(slug, { id: v.id ?? undefined, key: v.key, title: v.title, content: v.content, poleId: v.poleId });
      if (!res.ok) return setError(res.error);
      toast.success('Réponse enregistrée');
      onDone();
    });
  };
  const [confirming, setConfirming] = useState(false);
  const doRemove = () =>
    start(async () => {
      if (!initial.id) return;
      const res = await deleteSnippet(slug, initial.id);
      if (!res.ok) return setError(res.error);
      toast.success('Réponse supprimée');
      onDone();
    });
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="sn-title">Titre</Label><Input id="sn-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required maxLength={60} /></div>
          <div><Label htmlFor="sn-key">Clé</Label><Input id="sn-key" value={v.key} onChange={(e) => setV({ ...v, key: e.target.value.toLowerCase() })} required className="font-mono" disabled={Boolean(initial.id)} /></div>
        </div>
        <div><Label htmlFor="sn-pole">Disponible pour</Label>
          <select id="sn-pole" className={select} value={v.poleId ?? ''} onChange={(e) => setV({ ...v, poleId: e.target.value || null })}><option value="">Tous les pôles</option>{poles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </div>
        <div><Label htmlFor="sn-content">Message</Label><Textarea id="sn-content" value={v.content} onChange={(e) => setV({ ...v, content: e.target.value })} rows={6} required maxLength={1800} /><FieldHint>{v.content.length}/1800</FieldHint></div>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        {initial.id ? <Button type="button" variant="danger" onClick={() => setConfirming(true)} disabled={pending}>Supprimer</Button> : <span />}
        <div className="flex gap-2"><DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose><Button variant="primary" loading={pending}>Enregistrer</Button></div>
      </div>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Supprimer ce réponse ?" description={`La réponse rapide « ${initial.title} » ne sera plus proposée au staff.`} pending={pending} onConfirm={doRemove} />
    </form>
  );
}
