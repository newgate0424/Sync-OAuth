'use client';

import { Menu, User, LogOut, Users as UsersIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

interface UserSession {
  userId: number;
  username: string;
  full_name: string;
  role: 'admin' | 'user';
}

export default function Header({ onMenuClick, sidebarOpen = true }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const fetchSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          setUser(data.user);
        }
      }
    } catch (error) {
      console.error('Error fetching session:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className={`bg-white border-b border-gray-200 h-16 fixed top-0 right-0 z-10 transition-all duration-300 ${sidebarOpen ? 'lg:left-64' : 'lg:left-20'} left-0`}>
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Toggle menu"
          >
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {user?.role === 'admin' && (
            <button
              onClick={() => router.push('/users')}
              className="p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Manage users"
              title="จัดการผู้ใช้"
            >
              <UsersIcon className="w-5 h-5 text-gray-600" />
            </button>
          )}
          
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg"
              aria-label="User profile"
            >
              <User className="w-5 h-5 text-gray-600" />
              {user && (
                <span className="hidden sm:block text-sm text-gray-700">
                  {user.full_name}
                </span>
              )}
            </button>

            {showUserMenu && user && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                  <p className="text-xs text-gray-500">@{user.username}</p>
                  <span className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
                    user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" />
                  ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
