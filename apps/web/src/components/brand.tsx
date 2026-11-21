import Image from 'next/image';
import { cn } from '@/lib/cn';

/** Logo facetté de la marque (fichier fourni, transparent). */
export function LogoMark({ className, size = 22 }: { className?: string; size?: number }) {
  return <Image src="/logo.png" alt="" width={size} height={Math.round(size * 1.19)} className={cn('shrink-0 select-none', className)} priority />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-fg">Syntra</span>
    </span>
  );
}
