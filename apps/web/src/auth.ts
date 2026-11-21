import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@syntra/db';

/**
 * Connexion par OAuth2 Discord (scope `identify` uniquement : on ne lit pas la liste des serveurs de l'utilisateur,
 * ses rôles réels sont résolus côté serveur via le token du bot — voir lib/access.ts).
 *
 * Contournement de développement : actif UNIQUEMENT hors production ET avec AUTH_DEV_BYPASS=1.
 */
const devBypass = process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_BYPASS === '1';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    // L'URL doit être donnée en entier quand on surcharge `authorization` (sinon Auth.js : « Invalid URL »)
    // `issuer` : Discord renvoie désormais « iss=https://discord.com » ; sans cela Auth.js attend « https://authjs.dev » et refuse la réponse
    Discord({ clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET, issuer: 'https://discord.com', authorization: { url: 'https://discord.com/api/oauth2/authorize', params: { scope: 'identify' } } }),
    ...(devBypass
      ? [
          Credentials({
            id: 'dev',
            name: 'Développement',
            credentials: {},
            async authorize() {
              const id = process.env.AUTH_DEV_DISCORD_ID;
              if (!id) return null;
              return { id, name: process.env.AUTH_DEV_USERNAME ?? 'dev', image: null };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, profile, user }) {
      if (profile) {
        const p = profile as { id: string; username: string; global_name?: string | null; avatar?: string | null };
        token.discordId = p.id;
        token.username = p.global_name ?? p.username;
        token.avatar = p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64` : null;
      } else if (user && devBypass) {
        token.discordId = user.id!;
        token.username = user.name ?? 'dev';
        token.avatar = null;
      }
      return token;
    },
    async session({ session, token }) {
      session.discordId = token.discordId as string;
      session.user.name = (token.username as string) ?? session.user.name;
      session.user.image = (token.avatar as string | null) ?? null;
      return session;
    },
    async signIn({ profile, user }) {
      const p = profile as { id?: string; username?: string } | undefined;
      const discordId = p?.id ?? (devBypass ? user.id : undefined);
      if (!discordId) return false;
      await prisma.user.upsert({
        where: { discordId },
        update: { username: p?.username ?? user.name ?? 'user', lastLoginAt: new Date() },
        create: { discordId, username: p?.username ?? user.name ?? 'user', lastLoginAt: new Date() },
      });
      return true;
    },
  },
});
