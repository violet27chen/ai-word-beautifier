import { NextResponse } from 'next/server';
import { generatePaperDocx, type PaperConfig } from '@/lib/paper-template';
import { trackAdminEvent } from '@/lib/admin-metrics';

function sanitizeFileName(name: string) {
  const base = (name || '论文')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\.+$/g, '')
    .trim();
  return (base || '论文').slice(0, 80);
}

function toAsciiFallbackFileName(name: string) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
  return ascii || 'paper';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate required fields
    if (!body.title?.trim()) {
      return NextResponse.json({ error: '论文标题不能为空' }, { status: 400 });
    }
    if (!body.author?.trim()) {
      return NextResponse.json({ error: '作者不能为空' }, { status: 400 });
    }
    if (!body.abstractCn?.trim()) {
      return NextResponse.json({ error: '中文摘要不能为空' }, { status: 400 });
    }
    if (!body.abstractEn?.trim()) {
      return NextResponse.json({ error: '英文摘要不能为空' }, { status: 400 });
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: '论文正文不能为空' }, { status: 400 });
    }

    const config: PaperConfig = {
      title: body.title.trim(),
      subtitle: body.subtitle?.trim() || undefined,
      author: body.author.trim(),
      studentId: body.studentId?.trim() || undefined,
      major: body.major?.trim() || undefined,
      advisor: body.advisor?.trim() || undefined,
      institution: body.institution?.trim() || undefined,
      date: body.date?.trim() || undefined,
      abstractCn: body.abstractCn.trim(),
      abstractEn: body.abstractEn.trim(),
      keywordsCn: Array.isArray(body.keywordsCn) ? body.keywordsCn : [],
      keywordsEn: Array.isArray(body.keywordsEn) ? body.keywordsEn : [],
      content: body.content.trim(),
      references: Array.isArray(body.references)
        ? body.references.filter((r: string) => r?.trim())
        : [],
      templateType: body.templateType || 'bachelor',
    };

    const fileBuffer = await generatePaperDocx(config);

    const safeTitle = sanitizeFileName(config.title);
    const fileName = `${safeTitle}.docx`;
    const asciiFileName = `${toAsciiFallbackFileName(safeTitle)}.docx`;
    const encodedFileName = encodeURIComponent(fileName);

    await trackAdminEvent({
      type: 'download',
      status: 'success',
      markdownLength: String(config.content || '').length,
      hasImages: false,
    });

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`,
      },
    });
  } catch (error) {
    console.error('Download Paper API Error:', error);
    const err = error as Error;
    await trackAdminEvent({
      type: 'download',
      status: 'error',
      errorMessage: err.message?.slice(0, 200) || '论文生成失败',
    });
    return NextResponse.json(
      { error: err.message || '论文生成失败' },
      { status: 500 }
    );
  }
}
