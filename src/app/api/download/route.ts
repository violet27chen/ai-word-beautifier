import { NextResponse } from 'next/server';
import { marked } from 'marked';
import HTMLtoDOCX from 'html-to-docx';
import { trackAdminEvent } from '@/lib/admin-metrics';

function normalizeTitleText(input: string) {
  return input
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__|`|~~/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[#>*_~]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitleFromMarkdown(markdown: string) {
  const lines = (markdown || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    const htmlH1Match = line.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (htmlH1Match) {
      const normalized = normalizeTitleText(htmlH1Match[1]);
      if (normalized) return normalized;
    }
    const mdH1Match = line.match(/^#\s+(.+)$/);
    if (mdH1Match) {
      const normalized = normalizeTitleText(mdH1Match[1]);
      if (normalized) return normalized;
    }
  }
  return 'AI排版美化文档';
}

function sanitizeFileName(name: string) {
  const base = (name || 'AI排版美化文档')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/\.+$/g, '')
    .trim();
  return (base || 'AI排版美化文档').slice(0, 80);
}

function toAsciiFallbackFileName(name: string) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
  return ascii || 'ai-doc-beautify';
}

function injectInlineDocStyles(html: string) {
  return html
    .replace(/<h1(?![^>]*style=)([^>]*)>/gi, '<h1$1 style="text-align:center;font-family:SimSun,Songti SC,serif;font-weight:700;font-size:26px;line-height:1.6;margin:0 0 22px 0;color:#000;">')
    .replace(/<h2(?![^>]*style=)([^>]*)>/gi, '<h2$1 style="font-family:SimSun,Songti SC,serif;font-weight:700;font-size:20px;line-height:1.7;margin:20px 0 12px 0;color:#000;">')
    .replace(/<h3(?![^>]*style=)([^>]*)>/gi, '<h3$1 style="font-family:SimSun,Songti SC,serif;font-weight:700;font-size:17px;line-height:1.7;margin:16px 0 10px 0;color:#000;">')
    .replace(/<p([^>]*)class=["'][^"']*signature-line[^"']*["'](?![^>]*style=)([^>]*)>/gi, '<p$1 class="signature-line"$2 style="font-family:SimSun,Songti SC,serif;font-size:16px;line-height:1.8;text-align:right;text-indent:0;margin:0 0 6px 0;color:#333;">')
    .replace(/<p(?![^>]*style=)([^>]*)>/gi, '<p$1 style="font-family:FangSong,FangSong_GB2312,serif;font-size:16px;line-height:2;text-align:justify;text-indent:2em;margin:0 0 12px 0;color:#333;">')
    .replace(/<li(?![^>]*style=)([^>]*)>/gi, '<li$1 style="font-family:FangSong,FangSong_GB2312,serif;font-size:16px;line-height:2;color:#333;">')
    .replace(/<blockquote(?![^>]*style=)([^>]*)>/gi, '<blockquote$1 style="margin:14px 0;padding:8px 14px;border-left:4px solid #d1d5db;color:#4b5563;background:#f9fafb;">')
    .replace(/<table(?![^>]*style=)([^>]*)>/gi, '<table$1 style="width:100%;border-collapse:collapse;margin:12px 0;">')
    .replace(/<th(?![^>]*style=)([^>]*)>/gi, '<th$1 style="border:1px solid #d1d5db;padding:8px;background:#f3f4f6;">')
    .replace(/<td(?![^>]*style=)([^>]*)>/gi, '<td$1 style="border:1px solid #d1d5db;padding:8px;">')
    .replace(/<img(?![^>]*style=)([^>]*)>/gi, '<img$1 style="max-width:100%;height:auto;display:block;margin:12px auto;">');
}

export async function POST(req: Request) {
  try {
    const { markdown, images } = await req.json();

    let markdownOutput = markdown || '';
    
    // Post-process markdown to replace image IDs with base64 data
    const hasImages = images && images.length > 0;
    if (hasImages) {
      images.forEach((img: { id: string, base64: string }) => {
        // Find markdown images matching the ID, like `![alt](img_id)`
        // Escape the ID for regex
        const escapedId = img.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace exact match of the ID inside parenthesis
        const regex = new RegExp(`\\(${escapedId}\\)`, 'g');
        markdownOutput = markdownOutput.replace(regex, `(${img.base64})`);
      });
    }
    
    const htmlOutput = await marked(markdownOutput);
    const normalizedHtmlOutput = htmlOutput
      .replace(/<div\s+align=["']center["']>\s*<h1/gi, '<h1 style="text-align:center;"')
      .replace(/<\/h1>\s*<\/div>/gi, '</h1>');
    const styledHtmlOutput = injectInlineDocStyles(normalizedHtmlOutput);
    const htmlString = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>h1{text-align:center;font-family:SimSun,Songti SC,serif;}h2,h3{font-family:SimSun,Songti SC,serif;}p,li{font-family:FangSong,FangSong_GB2312,serif;line-height:2;color:#333;}div[align="center"]{text-align:center;}div[align="center"] h1{text-align:center;}</style></head><body>${styledHtmlOutput}</body></html>`;

    const fileBuffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });
    const title = extractTitleFromMarkdown(markdownOutput);
    const safeTitle = sanitizeFileName(title);
    const fileName = `${safeTitle}.docx`;
    const asciiFileName = `${toAsciiFallbackFileName(safeTitle)}.docx`;
    const encodedFileName = encodeURIComponent(fileName);

    trackAdminEvent({
      type: 'download',
      status: 'success',
      markdownLength: String(markdownOutput || '').length,
      hasImages: hasImages || false,
    });
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`,
      },
    });
  } catch (error) {
    console.error('Download API Error:', error);
    const err = error as Error;
    trackAdminEvent({
      type: 'download',
      status: 'error',
      errorMessage: err.message?.slice(0, 200) || '下载失败',
    });
    return NextResponse.json({ error: err.message || '下载失败' }, { status: 500 });
  }
}
