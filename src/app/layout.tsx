import type { Metadata } from 'next';
import './globals.css';
import ChunkErrorAutoReload from './chunk-error-auto-reload';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Word 排版美化助手',
  description: '智能排版美化Word文档，一键生成高质量文档下载',
  icons: {
    icon: '/file.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <ChunkErrorAutoReload />
        {children}
      </body>
    </html>
  );
}
