import { NextResponse } from 'next/server';
import { getImageFromRedis } from '@/lib/redis';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate id format to prevent path traversal
  if (!id || !/^img_[a-z0-9_]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid image id' }, { status: 400 });
  }

  const data = await getImageFromRedis(id);

  if (!data) {
    return NextResponse.json({ error: 'Image not found or expired' }, { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
