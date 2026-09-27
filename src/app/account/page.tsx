'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, UserRound } from 'lucide-react';

function meetsPasswordPolicy(value: string) {
  const characterTypes = [/[a-z]/.test(value), /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9\s]/.test(value)];
  return Array.from(value).length >= 8 && characterTypes.filter(Boolean).length >= 3;
}

export default function AccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    const verified = params.get('verified');
    if (token) {
      setResetToken(token);
      setMode('reset');
      window.history.replaceState(null, '', '/account');
    } else if (verified === '1') {
      setNotice('邮箱验证成功，账号已登录。');
      window.history.replaceState(null, '', '/account');
    } else if (verified) {
      setError(verified === 'invalid' ? '验证链接已失效，请申请重新发送。' : '验证暂时失败，请稍后重试。');
      setCanResend(true);
      window.history.replaceState(null, '', '/account');
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((mode === 'register' || mode === 'reset') && !meetsPasswordPolicy(password)) {
      setError('密码至少需要 8 个字符，并且大写字母、小写字母、数字、特殊字符中至少包含 3 种。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const endpoint = mode === 'reset' ? '/api/auth/password-reset/confirm' : mode === 'forgot' ? '/api/auth/password-reset' : `/api/auth/${mode}`;
      const body = mode === 'reset' ? { token: resetToken, password } : mode === 'forgot' ? { email } : mode === 'verify' ? { email, code: verificationCode } : { email, password };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; verificationRequired?: boolean };
      if (!response.ok && mode === 'register' && result.verificationRequired) {
        setMode('verify'); setCanResend(true); setError(result.error || '账号已创建，请获取验证码后完成邮箱验证。'); return;
      }
      if (!response.ok) throw new Error(result.error || '操作失败，请稍后重试。');
      if (mode === 'register') {
        setMode('verify');
        setPassword('');
        setCanResend(true);
        setNotice('验证码已发送到你的邮箱，请在下方输入 6 位验证码。');
      } else if (mode === 'forgot') {
        setMode('login');
        setNotice('如果该邮箱对应已验证账号，密码重置邮件将会发送。');
      } else if (mode === 'login' || mode === 'verify') {
        const returnTo = new URLSearchParams(window.location.search).get('returnTo');
        router.replace(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
        router.refresh();
      } else {
        router.replace('/');
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '操作失败，请稍后重试。');
      setCanResend(submitError instanceof Error && submitError.message.includes('邮箱尚未验证'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> 返回文档助手
        </Link>
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><UserRound className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{{ login: '登录账号', register: '创建账号', verify: '邮箱验证', forgot: '找回密码', reset: '设置新密码' }[mode]}</h1>
            <p className="mt-1 text-sm text-gray-500">登录后可统计个人生成和下载使用情况</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {mode !== 'reset' && <label className="block text-sm font-medium text-gray-700">
            邮箱
            <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="name@example.com" />
          </label>}
          {mode === 'verify' && <label className="block text-sm font-medium text-gray-700">
            邮箱验证码
            <input required type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.45em] text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="输入 6 位验证码" />
            <span className="mt-1 block text-xs font-normal text-gray-500">验证码 10 分钟内有效。请检查收件箱和垃圾邮件。</span>
          </label>}
          {mode !== 'forgot' && mode !== 'verify' && <label className="block text-sm font-medium text-gray-700">
            {mode === 'reset' ? '新密码' : '密码'}
            <input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' || mode === 'reset' ? 8 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder={mode === 'register' || mode === 'reset' ? '至少 8 个字符' : '请输入密码'} />
            {(mode === 'register' || mode === 'reset') && <>
              <span className="mt-1 block text-xs font-normal leading-5 text-gray-500">至少 8 个字符，并包含以下 4 种类型中的至少 3 种：大写字母、小写字母、数字、特殊字符。</span>
              {(() => {
                const types = [/[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9\s]/.test(password)].filter(Boolean).length;
                const length = Array.from(password).length;
                const score = password.length === 0 ? 0 : length < 8 || types <= 1 ? 1 : types === 2 ? 2 : types === 3 ? 3 : length >= 12 ? 4 : 3;
                const levels = ['未输入', '较弱', '一般', '良好', '很强'];
                const colors = ['bg-gray-200', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-600'];
                return <div className="mt-3" aria-live="polite">
                  <div className="mb-1.5 flex items-center justify-between text-xs font-normal">
                    <span className="text-gray-500">密码强度</span>
                    <span className={score < 2 ? 'font-medium text-rose-600' : score < 3 ? 'font-medium text-amber-600' : 'font-medium text-emerald-700'}>{levels[score]}</span>
                  </div>
                  <div className="flex gap-1" aria-label={`密码强度：${levels[score]}`}>
                    {[1, 2, 3, 4].map((segment) => <span key={segment} className={`h-1.5 flex-1 rounded-full ${segment <= score ? colors[score] : 'bg-gray-200'}`} />)}
                  </div>
                </div>;
              })()}
            </>}
          </label>}
          {mode === 'register' && <p className="text-xs leading-5 text-gray-500">注册会保存邮箱及账号/使用统计，不保存正文和图片。注册后输入邮件验证码即可完成验证并登录。</p>}
          {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={busy} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{{ login: '登录', register: '创建账号并发送验证码', verify: '验证邮箱并登录', forgot: '发送重置邮件', reset: '保存新密码' }[mode]}
          </button>
        </form>
        {(canResend || mode === 'verify') && mode !== 'reset' && <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            const response = await fetch('/api/auth/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
            const result = await response.json() as { message?: string; error?: string };
            if (!response.ok) throw new Error(result.error || '暂时无法重新发送验证码。');
            setMode('verify'); setVerificationCode(''); setNotice(result.message || '验证码已发送，请查收邮件。'); setCanResend(false);
          } catch (resendError) { setError(resendError instanceof Error ? resendError.message : '暂时无法重新发送验证码。'); }
          finally { setBusy(false); }
        }} className="mt-3 w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed">重新发送验证码</button>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-600">
          {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} className="cursor-pointer text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-800">忘记密码</button>}
          {mode !== 'reset' && mode !== 'verify' && <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); setCanResend(false); setVerificationCode(''); }} className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100">
            {mode === 'register' ? '已有账号？返回登录' : mode === 'login' ? '还没有账号？立即注册' : '返回登录'}
          </button>}
        </div>
      </div>
    </main>
  );
}
