import { connect, type TLSSocket } from 'node:tls';

type MailMessage = { to: string; subject: string; text: string; html?: string };

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function encodeBase64Inline(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function smtpResponseReader(socket: TLSSocket) {
  let buffer = '';
  let lines: string[] = [];
  const queued: string[] = [];
  let waiter: ((value: string) => void) | null = null;
  let rejectWaiter: ((error: Error) => void) | null = null;
  let waiterTimer: ReturnType<typeof setTimeout> | null = null;

  const onData = (chunk: Uint8Array | string) => {
    buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      lines.push(line);
      if (/^\d{3} /.test(line)) {
        const response = lines.join('\n');
        lines = [];
        if (waiter) {
          const resolve = waiter;
          if (waiterTimer) clearTimeout(waiterTimer);
          waiterTimer = null;
          waiter = null;
          rejectWaiter = null;
          resolve(response);
        } else {
          queued.push(response);
        }
      }
      newline = buffer.indexOf('\n');
    }
  };
  const onError = (error: Error) => {
    if (waiterTimer) clearTimeout(waiterTimer);
    waiterTimer = null;
    rejectWaiter?.(error);
    rejectWaiter = null;
    waiter = null;
  };
  socket.on('data', onData);
  socket.on('error', onError);

  return {
    read: () => {
      const response = queued.shift();
      if (response) return Promise.resolve(response);
      return new Promise<string>((resolve, reject) => {
        waiter = resolve;
        rejectWaiter = reject;
        waiterTimer = setTimeout(() => {
          if (waiter === resolve) {
            waiter = null;
            rejectWaiter = null;
            reject(new Error('SMTP server timed out'));
          }
        }, 12_000);
      });
    },
    close: () => {
      socket.off('data', onData);
      socket.off('error', onError);
    },
  };
}

export async function sendTransactionalEmail(message: MailMessage) {
  const host = process.env.SMTP_HOST?.trim() || 'smtp.tinkmail.me';
  const port = Number(process.env.SMTP_PORT) || 465;
  const username = process.env.SMTP_USER?.trim() || 'noreply@violet27chen.com';
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim() || 'noreply@violet27chen.com';
  if (!password) throw new Error('SMTP_PASSWORD is not configured');
  if (port !== 465) throw new Error('SMTP_PORT must be 465 (implicit TLS)');
  if ([host, username, from, message.to, message.subject].some((value) => /[\r\n]/.test(value))) {
    throw new Error('Invalid SMTP header value');
  }

  const socket = connect({ host, port, servername: host });
  const reader = smtpResponseReader(socket);
  const command = async (value: string, expected: string) => {
    await new Promise<void>((resolve, reject) => {
      socket.write(`${value}\r\n`, (error) => error ? reject(error) : resolve());
    });
    const response = await reader.read();
    if (!response.startsWith(expected)) throw new Error(`SMTP command rejected (${response.slice(0, 3)})`);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SMTP TLS connection timed out')), 12_000);
      socket.once('secureConnect', () => { clearTimeout(timer); resolve(); });
      socket.once('error', (error) => { clearTimeout(timer); reject(error); });
    });
    if (!(await reader.read()).startsWith('220')) throw new Error('SMTP server greeting failed');
    await command('EHLO ai-word-beautifier', '250');
    await command('AUTH LOGIN', '334');
    await command(encodeBase64Inline(username), '334');
    await command(encodeBase64Inline(password), '235');
    await command(`MAIL FROM:<${from}>`, '250');
    await command(`RCPT TO:<${message.to}>`, '250');
    await command('DATA', '354');

    const boundary = `aiword_${crypto.randomUUID().replace(/-/g, '')}`;
    const body = [
      `From: AI Word Assistant <${from}>`,
      `To: <${message.to}>`,
      `Subject: =?UTF-8?B?${encodeBase64(message.subject).replace(/\r\n/g, '')}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@violet27chen.com>`,
      'MIME-Version: 1.0',
      ...(message.html
        ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', encodeBase64(message.text), `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', encodeBase64(message.html), `--${boundary}--`]
        : ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', encodeBase64(message.text)]),
      '',
      '.',
      '',
    ].join('\r\n');
    await new Promise<void>((resolve, reject) => {
      socket.write(body, (error) => error ? reject(error) : resolve());
    });
    const accepted = await reader.read();
    if (!accepted.startsWith('250')) throw new Error(`SMTP message rejected (${accepted.slice(0, 3)})`);
    await command('QUIT', '221');
  } finally {
    reader.close();
    socket.destroy();
  }
}
