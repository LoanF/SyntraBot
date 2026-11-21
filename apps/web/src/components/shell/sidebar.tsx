'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Blocks, Check, ChevronsUpDown, Flag, KeyRound, LayoutDashboard, LayoutTemplate, LogOut, Plug, Plus, ScrollText, Server, SlidersHorizontal, Ticket, UserCog } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Wordmark } from '@/components/brand';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { signOutAction } from '@/server/session';

const ICONS = { overview: LayoutDashboard, modules: Blocks, tickets: Ticket, reports: Flag, embeds: LayoutTemplate, servers: Server, keys: KeyRound, audit: ScrollText, config: SlidersHorizontal, access: UserCog, integrations: Plug } as const;

export interface NavItem {
  href: string; // relatif au projet : '' | '/modules' …
  label: string;
  icon: keyof typeof ICONS;
  /** Conserver le serveur Discord sélectionné (?g=) en naviguant */
  guildScoped: boolean;
}

export interface SidebarProps {
  slug: string;
  projectName: string;
  projects: { slug: string; name: string }[];
  guilds: { id: string; label: string; kind: string; healthy: boolean | null }[];
  nav: NavItem[];
  viewer: { name: string; image: string | null };
  onNavigate?: () => void;
}

export function useSelectedGuild(guilds: SidebarProps['guilds']) {
  const params = useSearchParams();
  const g = params.get('g');
  return guilds.find((x) => x.id === g) ?? guilds[0] ?? null;
}

function Avatar({ name, image, size = 24 }: { name: string; image: string | null; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (image) return <img src={image} alt="" width={size} height={size} className="shrink-0 rounded-full" />;
  return (
    <span aria-hidden style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-brand">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SidebarContent({ slug, projectName, projects, guilds, nav, viewer, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const selected = useSelectedGuild(guilds);
  const base = `/${slug}`;

  const hrefFor = (item: NavItem) => {
    const q = item.guildScoped && selected ? `?g=${selected.id}` : '';
    return `${base}${item.href}${q}`;
  };
  const switchGuild = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('g', id);
    router.push(`${pathname}?${next.toString()}`);
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">
        <Link href="/" aria-label="Syntra, retour aux projets" onClick={onNavigate} className="inline-flex rounded-md">
          <Wordmark />
        </Link>
      </div>

      <div className="space-y-1.5 px-3">
        <DropdownMenu>
          <DropdownTrigger className="group flex w-full items-center gap-2.5 rounded-md border border-line bg-surface-1 px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{projectName}</span>
              <span className="block truncate font-mono text-[11px] text-subtle">{slug}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-subtle group-hover:text-muted" aria-hidden />
          </DropdownTrigger>
          <DropdownContent align="start" className="w-[15.5rem]">
            <DropdownLabel>Projets</DropdownLabel>
            {projects.map((p) => (
              <DropdownItem key={p.slug} asChild>
                <Link href={`/${p.slug}`} onClick={onNavigate}>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.slug === slug ? <Check className="size-3.5 text-brand" aria-hidden /> : null}
                </Link>
              </DropdownItem>
            ))}
            <DropdownSeparator />
            <DropdownItem asChild>
              <Link href="/new" onClick={onNavigate}>
                <Plus className="size-3.5 text-muted" aria-hidden />
                Nouveau projet
              </Link>
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>

        {guilds.length > 0 ? (
          <DropdownMenu>
            <DropdownTrigger className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-hover" aria-label="Changer de serveur Discord">
              <Server className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted group-hover:text-fg">{selected?.label ?? 'Serveur Discord'}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-subtle" aria-hidden />
            </DropdownTrigger>
            <DropdownContent align="start" className="w-[15.5rem]">
              <DropdownLabel>Serveurs Discord</DropdownLabel>
              {guilds.map((g) => (
                <DropdownItem key={g.id} onSelect={() => switchGuild(g.id)}>
                  <span className={cn('size-1.5 shrink-0 rounded-full', g.healthy === false ? 'bg-warning' : g.healthy ? 'bg-success' : 'bg-subtle')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{g.label}</span>
                  <span className="font-mono text-[11px] text-subtle">{g.kind}</span>
                  {g.id === selected?.id ? <Check className="size-3.5 text-brand" aria-hidden /> : null}
                </DropdownItem>
              ))}
            </DropdownContent>
          </DropdownMenu>
        ) : null}
      </div>

      <nav aria-label="Navigation du projet" className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const full = `${base}${item.href}`;
          const active = item.href === '' ? pathname === base : pathname === full || pathname.startsWith(`${full}/`);
          return (
            <Link
              key={item.href}
              href={hrefFor(item)}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                active ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-hover hover:text-fg',
              )}
            >
              {/* facette : coupe en biais tirée du logo, signale la page active */}
              <span aria-hidden className={cn('facet-tab absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 bg-brand transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
              <Icon className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-subtle group-hover:text-muted')} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <DropdownMenu>
          <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover">
            <Avatar name={viewer.name} image={viewer.image} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{viewer.name}</span>
          </DropdownTrigger>
          <DropdownContent side="top" align="start" className="w-[15.5rem]">
            <DropdownItem onSelect={() => void signOutAction()}>
              <LogOut className="size-3.5 text-muted" aria-hidden />
              Se déconnecter
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
