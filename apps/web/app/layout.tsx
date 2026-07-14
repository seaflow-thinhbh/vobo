import './globals.css';
import type { ReactNode } from 'react';
import { SocketProvider } from '@/lib/socket';
import { GlobalOverlay } from '@/components/GlobalOverlay';

export const metadata = {
  title: 'Vobo · Bingo',
  description: 'Chơi Bingo online cùng bạn bè hoặc đấu với bot',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-dvh bg-slate-900 text-slate-100 antialiased" suppressHydrationWarning>
        <SocketProvider>{children}</SocketProvider>
        <GlobalOverlay />
      </body>
    </html>
  );
}
