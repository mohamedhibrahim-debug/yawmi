// Optional account (name, email, password) and cloud backup on Supabase.
// The app works fully without signing in; signing in adds a backup that survives a lost phone.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { DB } from '../domain/model';
import { validate } from '../domain/io';

// Publishable values: safe to ship in the app. Row Level Security limits each person to their own row.
const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://lsnyoyuombdqmbtzuxrz.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_cc-eVV_LUAz-SFujyZ434w_N4QcO--E';

/** Where the email link brings people back: this web app when served over https, else the public web app. */
const PUBLIC_APP = 'https://mohamedhibrahim-debug.github.io/yawmi/';
export function appUrl(): string {
  const { protocol, hostname, origin } = location;
  if (protocol === 'https:' && hostname !== 'localhost') return origin + import.meta.env.BASE_URL;
  return PUBLIC_APP;
}

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  client ??= createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'yawmi-auth' }
  });
  return client;
}

export class CloudError extends Error {}

export type Account = { id: string; email: string | null; phone: string | null; name: string };

const toAccount = (s: Session | null): Account | null =>
  s ? {
    id: s.user.id,
    email: s.user.email ?? null,
    phone: s.user.phone ? `+${s.user.phone.replace(/^\+/, '')}` : null,
    name: String(s.user.user_metadata?.name ?? '')
  } : null;

export async function currentAccount(): Promise<Account | null> {
  try {
    const { data } = await sb().auth.getSession();
    return toAccount(data.session);
  } catch {
    return null;
  }
}

export function onAccountChange(cb: (a: Account | null) => void): () => void {
  const { data } = sb().auth.onAuthStateChange((_e, s) => cb(toAccount(s)));
  return () => data.subscription.unsubscribe();
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

function mapError(message: string): CloudError {
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return new CloudError('badCredentials');
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user_already_exists')) return new CloudError('emailTaken');
  if (m.includes('password') && (m.includes('least') || m.includes('weak') || m.includes('short'))) return new CloudError('weakPassword');
  if (m.includes('email') && m.includes('invalid')) return new CloudError('badEmail');
  if (m.includes('not confirmed')) return new CloudError('notConfirmed');
  if (m.includes('rate') || m.includes('too many')) return new CloudError('tooMany');
  if (m.includes('fetch') || m.includes('network')) return new CloudError('offline');
  return new CloudError('loginFailed');
}

export const MIN_PASSWORD = 8;

/** New account: name, email, password. No verification email; the account works right away. */
export async function signUp(name: string, email: string, password: string): Promise<Account> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isEmail(cleanEmail)) throw new CloudError('badEmail');
  if (password.length < MIN_PASSWORD) throw new CloudError('weakPassword');
  const { data, error } = await sb().auth.signUp({ email: cleanEmail, password, options: { data: { name: name.trim().slice(0, 40) } } });
  if (error) throw mapError(error.message);
  // With email confirmation off, Supabase signs the new user in straight away.
  if (!data.session) throw new CloudError(data.user?.identities?.length === 0 ? 'emailTaken' : 'notConfirmed');
  return toAccount(data.session)!;
}

export async function signIn(email: string, password: string): Promise<Account> {
  const { data, error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.session) throw mapError(error?.message ?? 'invalid login');
  return toAccount(data.session)!;
}

export async function signOut(): Promise<void> {
  await sb().auth.signOut().catch(() => undefined);
}

// ---------- backup ----------

export interface CloudBackup { db: DB; updatedAt: string }

export async function pushBackup(db: DB, device = navigator.userAgent.slice(0, 120)): Promise<string> {
  const acct = await currentAccount();
  if (!acct) throw new CloudError('signedOut');
  const { data, error } = await sb().from('backups')
    .upsert({ user_id: acct.id, data: db, revision: db.revision, device }, { onConflict: 'user_id' })
    .select('updated_at').single();
  if (error) throw mapError(error.message);
  return data.updated_at as string;
}

export async function pullBackup(): Promise<CloudBackup | null> {
  const acct = await currentAccount();
  if (!acct) throw new CloudError('signedOut');
  const { data, error } = await sb().from('backups').select('data, updated_at').eq('user_id', acct.id).maybeSingle();
  if (error) throw mapError(error.message);
  if (!data) return null;
  return { db: validate(data.data as Record<string, unknown>), updatedAt: data.updated_at as string };
}

export async function deleteAccountData(): Promise<void> {
  const acct = await currentAccount();
  if (!acct) return;
  await sb().from('backups').delete().eq('user_id', acct.id);
}
