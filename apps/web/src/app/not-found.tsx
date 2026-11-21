import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/page';

export const metadata = { title: 'Introuvable' };

/** 404 volontairement identique pour « n'existe pas » et « vous n'y avez pas accès » (aucune fuite d'existence). */
export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-lg content-center px-4 py-10">
      <Wordmark className="mb-6 justify-center" />
      <div className="rounded-lg border border-line bg-surface-1">
        <EmptyState title="Page introuvable" icon={SearchX} action={<Link href="/" className={buttonStyles({ variant: 'primary' })}>Retour aux projets</Link>}>
          Cette page n’existe pas, ou vous n’avez pas les droits pour la voir.
        </EmptyState>
      </div>
    </main>
  );
}
