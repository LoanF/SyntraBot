'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Lock, TriangleAlert } from 'lucide-react';
import { saveFivemDb, saveRcon, testFivemDb } from '@/server/integration-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, Textarea, selectClass as select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Panel, PanelHeader, relativeTime } from '@/components/page';


export function FivemDbForm({ slug, presets, initial }: { slug: string; presets: Record<string, string>; initial: { configured: boolean; framework: string; allowPrivateNetwork: boolean; mapping: string; lastCheckAt: string | null; lastCheckOk: boolean | null } }) {
  const [framework, setFramework] = useState(initial.framework);
  const [conn, setConn] = useState('');
  const [mapping, setMapping] = useState(initial.mapping);
  const [priv, setPriv] = useState(initial.allowPrivateNetwork);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startSave(async () => {
      const res = await saveFivemDb(slug, { framework, connectionString: conn || undefined, mapping, allowPrivateNetwork: priv });
      if (!res.ok) return setError(res.error);
      setConn('');
      toast.success('Base FiveM enregistrée (chiffrée)');
    });
  };
  const test = () =>
    startTest(async () => {
      setProblems(null);
      const res = await testFivemDb(slug);
      if (res.ok) return void toast.success('Connexion valide, compte en lecture seule');
      setProblems(res.error);
    });

  return (
    <Panel>
      <PanelHeader
        title="Base de données FiveM"
        description="Lecture seule : fiche joueur à l’ouverture des tickets et reports, synchro des rôles."
        actions={initial.configured ? <Badge tone={initial.lastCheckOk === false ? 'warning' : initial.lastCheckOk ? 'success' : 'neutral'}>{initial.lastCheckOk ? 'Vérifiée' : initial.lastCheckOk === false ? 'Échec du test' : 'Jamais testée'}</Badge> : undefined}
      />
      <form onSubmit={save} className="space-y-5 px-4 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="db-fw">Framework</Label>
            <select id="db-fw" className={select} value={framework} onChange={(e) => { const f = e.target.value; setFramework(f); if (f !== 'CUSTOM' && presets[f]) setMapping(presets[f]!); }}>
              <option value="QBOX">Qbox</option><option value="QBCORE">QBCore</option><option value="ESX">ESX</option><option value="CUSTOM">Personnalisé</option>
            </select>
          </div>
          <div>
            <Label htmlFor="db-conn">Chaîne de connexion</Label>
            <Input id="db-conn" type="password" autoComplete="off" value={conn} onChange={(e) => setConn(e.target.value)} className="font-mono" placeholder={initial.configured ? '•••••••• enregistrée — saisir pour remplacer' : 'mysql://lecture:motdepasse@hôte:3306/base'} />
            <FieldHint>Utilisez un compte avec le seul droit SELECT : un compte avec droits d’écriture est refusé au test.</FieldHint>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <Label htmlFor="db-map" className="mb-0">Correspondance des tables</Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setMapping(presets.SYNTRA!); setFramework('QBOX'); }}>Appliquer « Qbox + Syntra »</Button>
          </div>
          <Textarea id="db-map" value={mapping} onChange={(e) => setMapping(e.target.value)} rows={10} spellCheck={false} className="font-mono text-[12px] leading-relaxed" />
          <FieldHint>Noms de tables et de colonnes uniquement (lettres, chiffres, _). Jamais de SQL libre : les valeurs sont toujours des paramètres.</FieldHint>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border border-line bg-surface-2/50 px-3 py-2.5">
          <div>
            <Label className="mb-0 font-normal">Autoriser un hôte en réseau privé</Label>
            <FieldHint>Désactivé par défaut (protection SSRF). À n’activer que si la base est sur le même réseau que le bot.</FieldHint>
          </div>
          <Switch checked={priv} onCheckedChange={setPriv} aria-label="Autoriser un hôte en réseau privé" />
        </div>

        {problems ? (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] leading-snug text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{problems}</p>
        ) : null}
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-subtle">
            {initial.lastCheckAt ? <><CheckCircle2 className="size-3.5" aria-hidden />Dernier test {relativeTime(new Date(initial.lastCheckAt))}</> : null}
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={test} loading={testing} disabled={!initial.configured}>Tester la connexion</Button>
            <Button variant="primary" loading={saving}>Enregistrer</Button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

export function RconForm({ slug, initial }: { slug: string; initial: { configured: boolean; host: string; port: number; allowedCommands: string[] } }) {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [password, setPassword] = useState('');
  const [cmds, setCmds] = useState(initial.allowedCommands.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveRcon(slug, { host, port, password: password || undefined, allowedCommands: cmds.split(/[,\s]+/).filter(Boolean) });
      if (!res.ok) return setError(res.error);
      setPassword('');
      toast.success('RCON enregistré (mot de passe chiffré)');
    });
  };

  return (
    <Panel>
      <PanelHeader title="RCON" description="Commandes /ban, /kick, /revive, /announce. Seules les commandes de la liste blanche s’exécutent." actions={initial.configured ? <Badge tone="success"><Lock className="size-3" aria-hidden />Mot de passe chiffré</Badge> : undefined} />
      <form onSubmit={submit} className="space-y-5 px-4 py-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div><Label htmlFor="r-host">Hôte du serveur de jeu</Label><Input id="r-host" value={host} onChange={(e) => setHost(e.target.value)} required placeholder="jeu.exemple.com" className="font-mono" /></div>
          <div><Label htmlFor="r-port">Port</Label><Input id="r-port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} required min={1} max={65535} /></div>
        </div>
        <div><Label htmlFor="r-pass">Mot de passe RCON</Label><Input id="r-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={initial.configured ? '•••••••• enregistré — saisir pour remplacer' : 'rcon_password'} /></div>
        <div><Label htmlFor="r-cmds">Commandes autorisées</Label><Input id="r-cmds" value={cmds} onChange={(e) => setCmds(e.target.value)} className="font-mono" /><FieldHint>Séparées par des virgules. Les gabarits d’arguments se règlent dans le module RCON.</FieldHint></div>
        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-snug text-danger">{error}</p> : null}
        <div className="flex justify-end"><Button variant="primary" loading={pending}>Enregistrer</Button></div>
      </form>
    </Panel>
  );
}
