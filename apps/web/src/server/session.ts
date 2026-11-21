'use server';

import { signIn, signOut } from '@/auth';

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}

export async function signInDiscord() {
  await signIn('discord', { redirectTo: '/' });
}

/** Disponible uniquement si AUTH_DEV_BYPASS=1 hors production (voir auth.ts) */
export async function signInDev() {
  await signIn('dev', { redirectTo: '/' });
}
