// Optional account (email or mobile number, one-time code) and cloud backup on Supabase.
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

export type Account = { id: string; email: string | null; phone: string | null };

const toAccount = (s: Session | null): Account | null =>
  s ? { id: s.user.id, email: s.user.email ?? null, phone: s.user.phone ? `+${s.user.phone.replace(/^\+/, '')}` : null } : null;

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

/** Normalizes a mobile number to E.164; Egyptian local numbers (01xxxxxxxxx) get +20. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\s\-()]/g, '');
  if (/^\+\d{8,15}$/.test(d)) return d;
  if (/^00\d{8,15}$/.test(d)) return `+${d.slice(2)}`;
  if (/^01\d{9}$/.test(d)) return `+20${d.slice(1)}`; // Egypt mobile
  return null;
}

function mapError(message: string): CloudError {
  const m = message.toLowerCase();
  if (m.includes('phone') && (m.includes('provider') || m.includes('unsupported') || m.includes('disabled'))) return new CloudError('phoneUnavailable');
  if (m.includes('rate') || m.includes('seconds') || m.includes('too many')) return new CloudError('tooMany');
  if (m.includes('expired') || m.includes('invalid') || m.includes('token')) return new CloudError('badCode');
  if (m.includes('fetch') || m.includes('network')) return new CloudError('offline');
  return new CloudError('loginFailed');
}

/** Sends a one-time code by email or SMS. `who` is an email address or a mobile number. */
export async function sendCode(who: string): Promise<{ kind: 'email' | 'phone'; to: string }> {
  if (isEmail(who)) {
    const email = who.trim().toLowerCase();
    const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appUrl() } });
    if (error) throw mapError(error.message);
    return { kind: 'email', to: email };
  }
  const phone = normalizePhone(who);
  if (!phone) throw new CloudError('badContact');
  const { error } = await sb().auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
  if (error) throw mapError(error.message);
  return { kind: 'phone', to: phone };
}

export async function verifyCode(kind: 'email' | 'phone', to: string, code: string): Promise<Account> {
  const token = code.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\D/g, '');
  const { data, error } = kind === 'email'
    ? await sb().auth.verifyOtp({ email: to, token, type: 'email' })
    : await sb().auth.verifyOtp({ phone: to, token, type: 'sms' });
  if (error || !data.session) throw mapError(error?.message ?? 'invalid');
  return toAccount(data.session)!;
}

/** True when the page was opened from a sign-in email link. */
export const authInUrl = () => /access_token=|refresh_token=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search);

/** Finishes a sign-in from an email link: the client reads the tokens from the URL; then the URL is cleaned. */
export async function finishLinkSignIn(): Promise<{ account: Account | null; error: string | null }> {
  const err = new URLSearchParams(location.hash.slice(1)).get('error_description') ?? new URLSearchParams(location.search).get('error_description');
  const { data } = await sb().auth.getSession();
  history.replaceState(null, '', location.pathname + '#today');
  return { account: toAccount(data.session), error: err ? 'badCode' : null };
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
