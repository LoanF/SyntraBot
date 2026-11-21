import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: { default: 'Syntra', template: '%s · Syntra' },
  description: 'Console de pilotage du bot Syntra pour serveurs FiveM.',
  icons: { icon: '/logo.png' },
};
export const viewport: Viewport = { themeColor: '#0b0a10', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text)', borderRadius: '10px', fontSize: '13px' },
          }}
        />
      </body>
    </html>
  );
}
