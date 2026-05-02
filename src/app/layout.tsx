import type { Metadata } from 'next';
import './globals.css';
import ChunkErrorAutoReload from './chunk-error-auto-reload';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Document Formatter',
  description: 'Generate and format professional Word documents. Export to .docx in one click.',
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
    <html lang="en">
      <body className="antialiased">
        <ChunkErrorAutoReload />
        {children}
      </body>
    </html>
  );
}
