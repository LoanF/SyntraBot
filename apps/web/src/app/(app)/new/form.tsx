'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldHint, Input, Label, selectClass } from '@/components/ui/input';
import { createProject } from '@/server/actions';
import type { ActionResult } from '@/lib/server';

const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);

export function NewProjectForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(createProject, undefined);
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="name">Nom du projet</Label>
        <Input
          id="name" name="name" required maxLength={60} placeholder="Los Santos RP" autoFocus
          onChange={(e) => !touched && setSlug(slugify(e.target.value))}
        />
      </div>
      <div>
        <Label htmlFor="slug">Identifiant</Label>
        <Input
          id="slug" name="slug" required value={slug} className="font-mono" placeholder="los-santos-rp"
          onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)); }}
          aria-invalid={state && !state.ok ? true : undefined}
        />
        <FieldHint>Utilisé dans l’adresse de la console. 3 à 32 caractères, non modifiable ensuite.</FieldHint>
      </div>
      <div>
        <Label htmlFor="locale">Langue des messages du bot</Label>
        <select
          id="locale" name="locale" defaultValue="fr"
          className={selectClass}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
      {state && !state.ok ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button variant="primary" loading={pending}>Créer le projet</Button>
      </div>
    </form>
  );
}
