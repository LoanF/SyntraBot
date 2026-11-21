import { requireViewer } from '@/lib/access';

/** Toutes les pages de ce groupe exigent une session Discord. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();
  return <>{children}</>;
}
