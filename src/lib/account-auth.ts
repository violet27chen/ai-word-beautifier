import {
  createAccountSession,
  deleteAccountSession,
  findAccountBySession,
  consumeAuthAttempt,
  createAccountToken,
  type AccountTokenPurpose,
  type AccountUser,
} from '@/lib/user-db';
import { sendTransactionalEmail } from '@/lib/smtp-mailer';

export const ACCOUNT_SESSION_COOKIE = 'ai_word_session';
export const ACCOUNT_SESSION_SECONDS = 60 * 60 * 24 * 30;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  return new Uint8Array(value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || []);
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validEmail(email: string) {
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email);
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120_000 }, key, 256);
  return { salt: toHex(salt), hash: toHex(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = fromHex((await hashPassword(password, salt)).hash);
  const expected = fromHex(expectedHash);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual[index] ^ expected[index];
  return mismatch === 0;
}

export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export async function issueAccountSession(userId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toHex(bytes);
  const expiresAt = new Date(Date.now() + ACCOUNT_SESSION_SECONDS * 1000).toISOString();
  await createAccountSession(userId, await hashSessionToken(token), expiresAt);
  return token;
}

export async function sendAccountActionEmail(user: Pick<AccountUser, 'id' | 'email'>, purpose: AccountTokenPurpose, request: Request) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toHex(bytes);
  const expiresInSeconds = purpose === 'verify_email' ? 60 * 60 * 24 : 60 * 60;
  await createAccountToken(user.id, purpose, await hashSessionToken(token), new Date(Date.now() + expiresInSeconds * 1000).toISOString());
  const url = new URL(purpose === 'verify_email' ? '/api/auth/verify' : '/account', request.url);
  if (purpose === 'verify_email') url.searchParams.set('token', token);
  else url.searchParams.set('resetToken', token);
  const isVerification = purpose === 'verify_email';
  await sendTransactionalEmail({
    to: user.email,
    subject: isVerification ? 'Verify your AI Word account' : 'Reset your AI Word password',
    text: isVerification
      ? `您好，\n\n请在 24 小时内访问以下链接验证邮箱并登录：\n${url.toString()}\n\n如果这不是您发起的操作，请忽略此邮件。`
      : `您好，\n\n请在 1 小时内访问以下链接重置密码：\n${url.toString()}\n\n如果这不是您发起的操作，请忽略此邮件。`,
  });
}

export function readSessionToken(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const value = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ACCOUNT_SESSION_COOKIE}=`));
  const token = value?.slice(ACCOUNT_SESSION_COOKIE.length + 1) || '';
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}

export async function getRequestAccount(request: Request): Promise<AccountUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const user = await findAccountBySession(await hashSessionToken(token));
  return user?.status === 'active' ? user : null;
}

export async function revokeRequestSession(request: Request) {
  const token = readSessionToken(request);
  if (token) await deleteAccountSession(await hashSessionToken(token));
}

export async function allowAuthAttempt(request: Request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return consumeAuthAttempt(await hashSessionToken(`account-auth:${ip}`));
}

export function accountCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${ACCOUNT_SESSION_COOKIE}=${token}; Path=/; Max-Age=${ACCOUNT_SESSION_SECONDS}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function expiredAccountCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${ACCOUNT_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function requestHasValidOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
