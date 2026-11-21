import { Skeleton } from '@/components/ui/skeleton';

/** Squelette générique d'un écran de projet : titre, puis panneaux de lignes (pas de spinner au milieu du contenu). */
export default function Loading() {
  return (
    <div role="status" aria-label="Chargement">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          {[0, 1].map((p) => (
            <div key={p} className="overflow-hidden rounded-lg border border-line bg-surface-1">
              <div className="border-b border-line px-4 py-3"><Skeleton className="h-4 w-40" /></div>
              {[0, 1, 2, 3].map((r) => (
                <div key={r} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
                  <Skeleton className="size-8 rounded-md" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="hidden space-y-6 xl:block">
          <div className="space-y-3 rounded-lg border border-line bg-surface-1 p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-5/6" /></div>
        </div>
      </div>
      <span className="sr-only">Chargement en cours…</span>
    </div>
  );
}
