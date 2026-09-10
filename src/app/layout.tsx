import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';

export const metadata: Metadata = {
  title: 'Home Intelligence Platform | Telemetry & Anomaly Analysis',
  description: 'Production-quality engineering platform for household environmental telemetry, device health, and statistical anomaly detection.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-[1600px] w-full mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
