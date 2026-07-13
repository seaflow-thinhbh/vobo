import './globals.css';
import type { ReactNode } from 'react';
import { SocketProvider } from '@/lib/socket';

export const metadata = {
  title: 'Vobo · Bingo',
  description: 'Chơi Bingo online cùng bạn bè hoặc đấu với bot',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
