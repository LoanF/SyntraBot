import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { signInDev, signInDiscord } from '@/server/session';

export const metadata = { title: 'Connexion' };

const devBypass = process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_BYPASS === '1';

function DiscordGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M20.3 4.4A19.7 19.7 0 0 0 15.4 3l-.2.4c1.7.4 2.5 1 3.4 1.8a16.8 16.8 0 0 0-13.2 0c.9-.8 1.9-1.5 3.6-1.9L8.8 3A19.7 19.7 0 0 0 3.8 4.4C.7 9 0 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.9 19.9 0 0 0 6-3c.4-5.2-.7-9.7-3.4-13.6ZM8.3 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7.4 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
    </svg>
  );
}

export default async function LoginPage() {
  const session = await auth();
  if (session?.discordId) redirect('/');

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="anim-fade-up w-full max-w-[22rem]">
        <Wordmark className="mb-10 justify-center" />
        <div className="rounded-lg border border-line bg-surface-1 p-6">
          <h1 className="text-center text-lg font-semibold tracking-tight text-fg">Connexion à la console</h1>
          <p className="mx-auto mt-2 max-w-[30ch] text-center text-[13px] leading-relaxed text-muted">
            Utilisez votre compte Discord. Vos droits dépendent de vos rôles sur les serveurs du projet.
          </p>
          <form action={signInDiscord} className="mt-6">
            <Button variant="primary" size="lg" className="w-full">
              <DiscordGlyph />
              Continuer avec Discord
            </Button>
          </form>
          {devBypass ? (
            <form action={signInDev} className="mt-3">
              <Button variant="secondary" className="w-full">
                Connexion de développement
              </Button>
            </form>
          ) : null}
        </div>
        <p className="mt-5 text-center text-xs text-subtle">Nous lisons uniquement votre identifiant et votre pseudo Discord.</p>
      </div>
    </main>
  );
}
