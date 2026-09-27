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
// Cloudflare Workers rejects PBKDF2 iteration counts above 100,000.
const PASSWORD_HASH_ITERATIONS = 100_000;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  return new Uint8Array(value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || []);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validEmail(email: string) {
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email);
}

export function validPassword(password: string) {
  const characterTypes = [/[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9\s]/.test(password)];
  return Array.from(password).length >= 8 && Array.from(password).length <= 128 && characterTypes.filter(Boolean).length >= 3;
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_HASH_ITERATIONS }, key, 256);
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
  const isVerification = purpose === 'verify_email';
  const token = isVerification
    ? String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
    : toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresInSeconds = isVerification ? 10 * 60 : 60 * 60;
  const tokenHash = await hashSessionToken(isVerification ? `${user.email}:${token}` : token);
  await createAccountToken(user.id, purpose, tokenHash, new Date(Date.now() + expiresInSeconds * 1000).toISOString());
  const url = new URL('/login', request.url);
  if (!isVerification) url.searchParams.set('resetToken', token);
  const subject = isVerification ? 'AI Word 排版美化助手｜邮箱验证码' : 'AI Word 排版美化助手｜重置密码';
  const title = isVerification ? '验证你的邮箱' : '重置账号密码';
  const instruction = isVerification
    ? '请在页面中输入以下验证码，完成邮箱验证。'
    : '我们收到了重置账号密码的请求，请点击下方按钮设置新密码。';
  const escapedEmail = escapeHtml(user.email);
  const codeOrButton = isVerification
    ? `<div style="margin:24px 0;padding:18px 20px;border:1px solid #e0e7ff;border-radius:12px;background:#f5f3ff;text-align:center;color:#4338ca;font-size:32px;font-weight:700;letter-spacing:10px;">${token}</div><p style="margin:0;color:#64748b;font-size:13px;">验证码 10 分钟内有效，请勿分享给他人。</p>`
    : `<div style="margin:24px 0;text-align:center;"><a href="${escapeHtml(url.toString())}" style="display:inline-block;padding:12px 24px;border-radius:9px;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">设置新密码</a></div><p style="margin:0;color:#64748b;font-size:13px;">此链接 1 小时内有效。</p>`;
  const html = `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:32px 12px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;"><tr><td style="padding:22px 28px;border-bottom:1px solid #eef2f7;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:38px;height:38px;border-radius:10px;background:#4f46e5;color:#ffffff;text-align:center;vertical-align:middle;font-size:20px;font-weight:700;">W</td><td style="padding-left:12px;color:#111827;font-size:17px;font-weight:700;">AI Word 排版美化助手</td></tr></table></td></tr><tr><td style="padding:30px 28px 32px;"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.4;">${title}</h1><p style="margin:0;color:#475569;font-size:15px;line-height:1.8;">你好，${escapedEmail}：</p><p style="margin:8px 0 0;color:#475569;font-size:15px;line-height:1.8;">${instruction}</p>${codeOrButton}<p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.7;">如果这不是你本人发起的操作，请忽略此邮件。为保障账号安全，请不要向任何人透露验证码。</p></td></tr><tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #eef2f7;color:#94a3b8;font-size:12px;line-height:1.6;">此邮件由 AI Word 排版美化助手自动发送，请勿直接回复。<br>© AI Word 排版美化助手</td></tr></table></body></html>`;
  await sendTransactionalEmail({
    to: user.email,
    subject,
    text: isVerification
      ? `AI Word 排版美化助手\n\n你的邮箱验证码是：${token}\n请在 10 分钟内输入验证码完成验证。\n\n如果这不是你本人发起的操作，请忽略此邮件。请勿向任何人透露验证码。`
      : `AI Word 排版美化助手\n\n请在 1 小时内打开以下链接重置密码：\n${url.toString()}\n\n如果这不是你本人发起的操作，请忽略此邮件。`,
    html,
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
