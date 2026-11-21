'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Activity, AlertTriangle, BadgeCheck, Flag, LayoutTemplate, Settings2, ShieldCheck, Terminal, Ticket, Users, type LucideIcon } from 'lucide-react';
import type { ModuleKey } from '@syntra/shared';
import { MODULE_UI, type FieldSpec } from '@/lib/modules-ui';
import { saveModuleConfig, toggleModule } from '@/server/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FieldHint, Input, Label, selectClass } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

const ICONS: Record<string, LucideIcon> = { ticket: Ticket, flag: Flag, shield: ShieldCheck, terminal: Terminal, activity: Activity, users: Users, layout: LayoutTemplate, badge: BadgeCheck };

export interface ModuleRowData {
  id: string;
  key: ModuleKey;
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
  canManage: boolean;
  missingPermissions: string[];
}
export interface DiscordOptions {
  channels: { id: string; name: string; parentId: string | null }[];
  roles: { id: string; name: string; color: number }[];
}

export function ModuleRow({ slug, row, options }: { slug: string; row: ModuleRowData; options: DiscordOptions | null }) {
  const ui = MODULE_UI[row.key];
  const Icon = ICONS[ui.icon] ?? Settings2;
  const [enabled, setEnabled] = useState(row.enabled);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const onToggle = (next: boolean) => {
    setEnabled(next); // retour visuel immédiat, annulé si le serveur refuse
    start(async () => {
      const res = await toggleModule(slug, row.id, next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
        if (next && ui.fields.length > 0) setOpen(true); // config incomplète : on ouvre directement le formulaire
        return;
      }
      toast.success(`${ui.label} ${next ? 'activé' : 'désactivé'}`);
    });
  };

  const incomplete = enabled && !row.configured;
  const hasIssue = enabled && row.missingPermissions.length > 0;

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-md border transition-colors', enabled ? 'border-accent-line bg-accent-soft text-brand' : 'border-line bg-surface-2 text-subtle')}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-medium text-fg">{ui.label}</h3>
          {incomplete ? <Badge tone="warning">Configuration incomplète</Badge> : null}
          {hasIssue ? (
            <Tip label={`Le bot n’a pas ces permissions sur le serveur : ${row.missingPermissions.join(', ')}. Ajoutez-les au rôle du bot dans Discord.`}>
              <button type="button" className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning">
                <AlertTriangle className="size-3" aria-hidden />
                Permission manquante
              </button>
            </Tip>
          ) : null}
        </div>
        <p className="mt-0.5 max-w-[62ch] text-[13px] leading-snug text-muted">{ui.description}</p>
        {hasIssue ? <p className="mt-1 text-xs text-warning">{row.missingPermissions.join(' · ')}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:justify-end">
        {(ui.fields.length > 0 || ui.note) && row.canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm">
                <Settings2 className="size-3.5" aria-hidden />
                Configurer
              </Button>
            </DialogTrigger>
            <DialogContent title={`${ui.label}`} description={ui.note ?? 'Les valeurs vides utilisent le comportement par défaut.'} side="right">
              {ui.fields.length > 0 ? <ConfigForm slug={slug} row={row} options={options} onSaved={() => setOpen(false)} /> : <p className="px-5 py-6 text-[13px] text-muted">{ui.note}</p>}
            </DialogContent>
          </Dialog>
        ) : null}
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={!row.canManage || pending}
          aria-label={`${enabled ? 'Désactiver' : 'Activer'} ${ui.label}`}
        />
      </div>
    </li>
  );
}

// ------------------------------------------------------------------------------------ formulaire

type Values = Record<string, unknown>;

function ConfigForm({ slug, row, options, onSaved }: { slug: string; row: ModuleRowData; options: DiscordOptions | null; onSaved: () => void }) {
  const ui = MODULE_UI[row.key];
  const [values, setValues] = useState<Values>(row.config);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveModuleConfig(slug, row.id, values);
      if (!res.ok) return setError(res.error);
      toast.success('Configuration enregistrée');
      onSaved();
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {ui.fields.map((f) => (
          <Field key={f.key} spec={f} value={values[f.key]} onChange={(v) => set(f.key, v)} options={options} />
        ))}
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <DialogClose asChild>
          <Button type="button" variant="ghost">Annuler</Button>
        </DialogClose>
        <Button variant="primary" loading={pending}>Enregistrer</Button>
      </div>
    </form>
  );
}

function Field({ spec, value, onChange, options }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; options: DiscordOptions | null }) {
  const id = `f-${spec.key}`;

  if (spec.kind === 'bool') {
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="mb-0 font-normal">{spec.label}</Label>
        <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }

  const label = (
    <Label htmlFor={id}>
      {spec.label}
      {spec.required ? <span className="ml-1 text-brand" aria-label="obligatoire">*</span> : null}
    </Label>
  );

  if (spec.kind === 'channel' || spec.kind === 'role') {
    const list = spec.kind === 'channel' ? options?.channels.map((c) => ({ id: c.id, name: `# ${c.name}` })) : options?.roles.map((r) => ({ id: r.id, name: `@ ${r.name}` }));
    return (
      <div>
        {label}
        {list ? (
          <select
            id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}
            className={selectClass}
          >
            <option value="">{spec.required ? 'Choisir…' : 'Aucun'}</option>
            {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <Input id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className="font-mono" placeholder="Identifiant Discord (17-20 chiffres)" inputMode="numeric" />
        )}
        {spec.help ? <FieldHint>{spec.help}</FieldHint> : null}
      </div>
    );
  }

  if (spec.kind === 'channels' || spec.kind === 'roles') {
    const selected = new Set(((value as string[]) ?? []).map(String));
    const list = spec.kind === 'channels' ? options?.channels.map((c) => ({ id: c.id, name: `# ${c.name}` })) : options?.roles.map((r) => ({ id: r.id, name: `@ ${r.name}` }));
    const toggle = (oid: string) => {
      const next = new Set(selected);
      if (next.has(oid)) next.delete(oid); else next.add(oid);
      onChange([...next]);
    };
    return (
      <div>
        {label}
        {list ? (
          <div role="group" aria-labelledby={id} className="max-h-44 overflow-y-auto rounded-md border border-line-strong bg-surface-1 p-1">
            {list.length === 0 ? <p className="px-2 py-2 text-xs text-subtle">Aucun élément sur ce serveur.</p> : null}
            {list.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-[13px] text-fg hover:bg-hover">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="size-3.5 accent-brand-deep" />
                <span className="truncate">{o.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <Input
            id={id} className="font-mono" placeholder="Identifiants séparés par des virgules"
            value={[...selected].join(', ')}
            onChange={(e) => onChange(e.target.value.split(/[,\s]+/).filter(Boolean))}
          />
        )}
        {selected.size > 0 ? <FieldHint>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</FieldHint> : null}
        {spec.help ? <FieldHint>{spec.help}</FieldHint> : null}
      </div>
    );
  }

  if (spec.kind === 'number') {
    return (
      <div>
        {label}
        <div className="relative">
          <Input id={id} type="number" value={(value as number | string | undefined) ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={spec.suffix ? 'pr-12' : ''} />
          {spec.suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-subtle">{spec.suffix}</span> : null}
        </div>
        {spec.help ? <FieldHint>{spec.help}</FieldHint> : null}
      </div>
    );
  }

  return (
    <div>
      {label}
      <Input id={id} type={spec.kind === 'url' ? 'url' : 'text'} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder} className={spec.kind === 'text' && spec.key.toLowerCase().includes('pattern') ? 'font-mono' : ''} />
      {spec.help ? <FieldHint>{spec.help}</FieldHint> : null}
    </div>
  );
}
