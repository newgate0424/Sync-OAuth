'use client';

import "./globals.css";
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    setMounted(true);
    const savedState = localStorage.getItem('sidebarOpen');
    if (savedState !== null) {
      setSidebarOpen(savedState === 'true');
    } else {
      setSidebarOpen(window.innerWidth >= 1024);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('sidebarOpen', sidebarOpen.toString());
    }
  }, [sidebarOpen, mounted]);

  if (!mounted && !isLoginPage) {
    return (
      <html lang="th">
        <body className="antialiased">
          <div className="min-h-screen bg-gray-50" />
        </body>
      </html>
    );
  }

  return (
    <html lang="th">
      <body className="antialiased">
        {isLoginPage ? (
          children
        ) : (
          <div className="min-h-screen bg-gray-50">
            <Sidebar 
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />
            <Header 
              onMenuClick={() => setSidebarOpen(!sidebarOpen)} 
              sidebarOpen={sidebarOpen} 
            />
            
            <main className={`transition-all duration-300 pt-16 ${
              sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
            }`}>
              <div className="p-4 md:p-6 lg:p-8">
                {children}
              </div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}

