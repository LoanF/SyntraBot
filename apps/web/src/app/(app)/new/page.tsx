import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { PageHeader, Panel } from '@/components/page';
import { NewProjectForm } from './form';

export const metadata = { title: 'Nouveau projet' };

export default function NewProjectPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <Wordmark className="mb-10" />
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden />
        Projets
      </Link>
      <PageHeader title="Nouveau projet" description="Le projet démarre avec la configuration par défaut : statuts de tickets, textes FR/EN, modules désactivés. Tout se modifie ensuite." />
      <Panel className="p-5">
        <NewProjectForm />
      </Panel>
    </div>
  );
}
