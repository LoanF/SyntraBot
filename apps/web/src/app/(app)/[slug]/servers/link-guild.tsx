'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { linkGuild } from '@/server/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/cn';

const KINDS = ['main', 'staff', 'legal', 'illegal', 'event', 'dev'];

export function LinkGuild({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('main');
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await linkGuild(slug, { discordGuildId: id.trim(), label, kind });
      if (!res.ok) return setError(res.error);
      toast.success('Serveur rattaché : modules et pôles par défaut créés');
      setOpen(false);
      setId(''); setLabel('');
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><Plus className="size-3.5" aria-hidden />Ajouter un serveur</Button>
      </DialogTrigger>
      <DialogContent title="Rattacher un serveur Discord" description="Le bot doit déjà être présent sur le serveur. Nous vérifions que vous en êtes propriétaire ou administrateur.">
        <form onSubmit={submit} className="space-y-5 px-5 py-5">
          <div>
            <Label htmlFor="g-id">Identifiant du serveur</Label>
            <Input id="g-id" value={id} onChange={(e) => setId(e.target.value)} className="font-mono" inputMode="numeric" placeholder="123456789012345678" required autoFocus />
            <FieldHint>Discord › Paramètres avancés › Mode développeur, puis clic droit sur le serveur › Copier l’identifiant.</FieldHint>
          </div>
          <div>
            <Label htmlFor="g-label">Nom affiché</Label>
            <Input id="g-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pôle Légal" required maxLength={60} />
          </div>
          <div>
            <Label id="g-kind-label">Type</Label>
            <div role="radiogroup" aria-labelledby="g-kind-label" className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k} type="button" role="radio" aria-checked={!custom && kind === k}
                  onClick={() => { setCustom(false); setKind(k); }}
                  className={cn('rounded-md border px-2.5 py-1 font-mono text-[12px] transition-colors', !custom && kind === k ? 'border-accent-line bg-accent-soft text-fg' : 'border-line-strong bg-surface-1 text-muted hover:border-line-hover hover:text-fg')}
                >
                  {k}
                </button>
              ))}
              <button
                type="button" role="radio" aria-checked={custom}
                onClick={() => { setCustom(true); setKind(''); }}
                className={cn('rounded-md border px-2.5 py-1 text-[12px] transition-colors', custom ? 'border-accent-line bg-accent-soft text-fg' : 'border-line-strong bg-surface-1 text-muted hover:border-line-hover hover:text-fg')}
              >
                Autre…
              </button>
            </div>
            {custom ? <Input aria-label="Type personnalisé" value={kind} onChange={(e) => setKind(e.target.value.toLowerCase())} className="mt-2 font-mono" placeholder="ex. recrutement" maxLength={24} required autoFocus /> : null}
            <FieldHint>Les pôles de tickets par défaut (staff, legal, illegal) sont créés selon ce type.</FieldHint>
          </div>
          {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">Annuler</Button></DialogClose>
            <Button variant="primary" loading={pending}>Rattacher</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
