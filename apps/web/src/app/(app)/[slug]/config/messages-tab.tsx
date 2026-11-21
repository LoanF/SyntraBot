'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Search } from 'lucide-react';
import { DEFAULT_MESSAGES as DEFAULTS, MESSAGE_VARIABLES, renderTemplate, unknownVariables } from '@syntra/shared';
import { resetMessage, saveMessage } from '@/server/config-actions';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Mono, Panel } from '@/components/page';
import { cn } from '@/lib/cn';

export interface MessageItem { key: string; fr: string; en: string; hasDefault: boolean }
const SAMPLE: Record<string, string> = { user: '@Jade', username: 'Jade', staff: 'Camille', pole: 'Staff', reason: 'Motif', content: 'Votre message', max: '3', sheetUrl: 'https://…', url: 'https://…', count: '2', name: 'Jade Moreau', citizenId: 'ABC12345', job: 'LSPD', cash: '120', bank: '5000', uid: '2381', serverId: '17', externalId: '1042', author: 'Jade', role: 'Membre', 'ticket.number': '42', 'ticket.id': 'abc' };

export function MessagesTab({ slug, items }: { slug: string; items: MessageItem[] }) {
  const [q, setQ] = useState('');
  const [locale, setLocale] = useState<'fr' | 'en'>('fr');
  const filtered = useMemo(() => items.filter((i) => i.key.includes(q.toLowerCase()) || i.fr.toLowerCase().includes(q.toLowerCase())), [items, q]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un texte…" className="pl-8" aria-label="Rechercher un texte" />
        </div>
        <div className="flex gap-1 rounded-md border border-line bg-surface-1 p-0.5" role="tablist" aria-label="Langue">
          {(['fr', 'en'] as const).map((l) => (
            <button key={l} role="tab" aria-selected={locale === l} onClick={() => setLocale(l)} className={cn('rounded px-3 py-1 text-[13px] uppercase transition-colors', locale === l ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>{l}</button>
          ))}
        </div>
        <p className="text-xs text-subtle">Variables : {MESSAGE_VARIABLES.slice(0, 6).map((v) => `{${v}}`).join(' ')}…</p>
      </div>
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {filtered.map((i) => <MessageRow key={`${i.key}:${locale}`} slug={slug} item={i} locale={locale} />)}
          {filtered.length === 0 ? <li className="px-4 py-10 text-center text-[13px] text-subtle">Aucun texte ne correspond.</li> : null}
        </ul>
      </Panel>
    </>
  );
}

function MessageRow({ slug, item, locale }: { slug: string; item: MessageItem; locale: 'fr' | 'en' }) {
  const original = item[locale];
  const [value, setValue] = useState(original);
  const [saved, setSaved] = useState(original);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== saved;
  const unknown = unknownVariables(value);

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveMessage(slug, item.key, locale, value);
      if (!res.ok) return setError(res.error);
      setSaved(value.trim());
      toast.success('Texte enregistré');
    });
  const reset = () =>
    start(async () => {
      const res = await resetMessage(slug, item.key, locale);
      if (!res.ok) return void toast.error(res.error);
      setValue(res.content); setSaved(res.content); setError(null);
      toast.success('Valeur par défaut rétablie');
    });

  return (
    <li className="grid gap-3 px-4 py-3.5 lg:grid-cols-[14rem_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0"><Mono className="break-all">{item.key}</Mono></div>
      <div className="min-w-0">
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} aria-label={`Texte ${item.key} (${locale})`} aria-invalid={unknown.length > 0 || undefined} />
        {unknown.length ? <p className="mt-1 text-xs text-danger">Variable inconnue : {unknown.map((v) => `{${v}}`).join(', ')}</p> : null}
        {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
        {/* Les actions n'apparaissent que si elles servent : le violet reste un signal */}
        {dirty || (item.hasDefault && saved !== DEFAULTS[item.key]?.[locale]) ? (
          <div className="mt-2 flex gap-2">
            {dirty ? <Button size="sm" variant="primary" onClick={save} loading={pending} disabled={unknown.length > 0}>Enregistrer</Button> : null}
            {item.hasDefault && saved !== DEFAULTS[item.key]?.[locale] ? <Button size="sm" variant="ghost" onClick={reset} disabled={pending}><RotateCcw className="size-3.5" aria-hidden />Rétablir le défaut</Button> : null}
          </div>
        ) : null}
      </div>
      <div className="min-w-0 rounded-md border border-line bg-surface-2/50 px-3 py-2">
        <p className="text-xs text-subtle">Aperçu</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">{renderTemplate(value, SAMPLE)}</p>
      </div>
    </li>
  );
}
