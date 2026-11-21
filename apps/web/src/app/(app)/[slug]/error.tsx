'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel } from '@/components/page';

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Panel>
      <EmptyState
        title="Cette page n’a pas pu se charger"
        icon={TriangleAlert}
        action={<Button variant="primary" onClick={reset}>Réessayer</Button>}
      >
        Une erreur inattendue s’est produite. Réessayez ; si elle persiste, indiquez ce code à l’administrateur : <span className="font-mono">{error.digest ?? 'n/a'}</span>.
      </EmptyState>
    </Panel>
  );
}
