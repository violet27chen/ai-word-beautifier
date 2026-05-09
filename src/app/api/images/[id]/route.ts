import { NextResponse } from 'next/server';
import { getImage } from '@/lib/image-store';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^img_[a-z0-9_]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid image id' }, { status: 400 });
  }

  const data = getImage(id);

  if (!data) {
    return NextResponse.json({ error: 'Image not found or expired' }, { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
