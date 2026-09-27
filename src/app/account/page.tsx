import { redirect } from 'next/navigation';

export default async function LegacyAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['returnTo', 'resetToken', 'verified']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  redirect(`/login${suffix}`);
}
