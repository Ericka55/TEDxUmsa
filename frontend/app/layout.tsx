import type { Metadata } from 'next';
import './styles.css';
import ThemeToggle from './theme-toggle';

export const metadata: Metadata = {
  title: 'TEDxUMSA | Ideas que merecen compartirse',
  description: 'Eventos TEDxUMSA y registro de asistentes.',
};

// Per-request rendering lets proxy.ts attach a fresh CSP nonce to Next.js scripts.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><ThemeToggle />{children}</body></html>;
}
