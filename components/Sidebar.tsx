'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, FileText, Home, Settings, X, Clock, LayoutDashboard, HardDrive, Terminal } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
}

const menuItems = [
  { icon: Home, label: 'หน้าหลัก', href: '/' },
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Database, label: 'Database', href: '/database' },
  { icon: Terminal, label: 'SQL Query', href: '/query' },
  { icon: HardDrive, label: 'Backup', href: '/backup' },
  { icon: Clock, label: 'Cron Jobs', href: '/cron' },
  { icon: FileText, label: 'Logs', href: '/log' },
  { icon: Settings, label: 'ตั้งค่า', href: '/settings' },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Overlay - แสดงเฉพาะบน mobile เมื่อเปิด sidebar */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 shadow-lg z-30 transition-all duration-300 ease-in-out ${
          isOpen 
            ? 'w-64' /* เปิด = แสดงเต็ม */
            : 'w-20 -translate-x-full lg:translate-x-0' /* ปิด = ซ่อนบน mobile, แสดงแค่ไอคอนบน desktop */
        }`}
      >
        <div className={`flex items-center border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 ${
          isOpen ? 'justify-between' : 'justify-center'
        }`}>
          <div className={`flex items-center ${
            isOpen ? 'gap-2' : 'justify-center'
          }`}>
            <Database className="w-8 h-8 text-blue-600" />
            {isOpen && <span className="text-lg font-bold text-gray-800">ads169th</span>}
          </div>
          {isOpen && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded lg:hidden"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        <nav className="p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      // ปิด sidebar เฉพาะบน mobile
                      if (window.innerWidth < 1024) {
                        onClose();
                      }
                    }}
                    className={`flex items-center rounded-lg transition-colors ${
                      isOpen 
                        ? (isActive
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-gray-700 hover:bg-blue-50')
                        : (isActive
                            ? 'bg-blue-100 text-blue-600'
                            : 'text-gray-700 hover:bg-gray-100')
                    } ${
                      isOpen ? 'gap-3 px-4 py-3' : 'justify-center p-2'
                    }`}
                    title={!isOpen ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {isOpen && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {isOpen && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              <p className="font-medium">Connected to PostgreSQL</p>
              <p className="text-xs mt-1 text-gray-500">Version 15+</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
