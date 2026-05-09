import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

const IMAGE_DIR = '/tmp/ai-word-images';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate id format to prevent path traversal
  if (!id || !/^img_[a-z0-9_]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid image id' }, { status: 400 });
  }

  const filePath = join(IMAGE_DIR, `${id}.png`);

  try {
    await stat(filePath);
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
