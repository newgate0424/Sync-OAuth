'use client';

import Link from 'next/link';
import { Database, FileText, Clock, Settings, ArrowRight, CheckCircle, Zap, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Home() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        setDbStatus(data.status === 'healthy' ? 'connected' : 'disconnected');
      } catch (error) {
        setDbStatus('disconnected');
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-12 mb-8 text-white shadow-xl">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-bold mb-4">
            Google Sheets Sync System
          </h1>
          <p className="text-xl text-blue-100 mb-6">
            ระบบซิงค์ข้อมูลจาก Google Sheets สู่ฐานข้อมูลอัตโนมัติ และการจัดการที่ง่ายดาย
          </p>
          <div className="flex items-center gap-4">
            <Link 
              href="/database"
              className="inline-flex items-center gap-2 bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              ไปที่ Database
              <ArrowRight className="w-5 h-5" />
            </Link>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              dbStatus === 'connected' 
                ? 'bg-green-500 bg-opacity-30' 
                : dbStatus === 'disconnected'
                ? 'bg-red-500 bg-opacity-30'
                : 'bg-yellow-500 bg-opacity-30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                dbStatus === 'connected' 
                  ? 'bg-green-200' 
                  : dbStatus === 'disconnected'
                  ? 'bg-red-200'
                  : 'bg-yellow-200'
              }`}></div>
              <span className="text-sm">
                {dbStatus === 'connected' ? 'Database Connected' : dbStatus === 'disconnected' ? 'Database Disconnected' : 'Checking...'}
              </span>
            </div>
          </div>
        </div>
      </div>



      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
            <Database className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">จัดการข้อมูล</h3>
          <p className="text-gray-600 text-sm">
            สำรวจ ค้นหา และจัดการข้อมูลในตารางต่างๆ ได้อย่างง่ายดาย พร้อม pagination
          </p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">รองรับหลาย DB</h3>
          <p className="text-gray-600 text-sm">
            รองรับทั้ง MySQL/MariaDB และ PostgreSQL พร้อมระบบ auto-migration
          </p>
        </div>
      </div>

      {/* Main Menu Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/database">
          <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-green-500 group">
            <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl mb-4 group-hover:scale-110 transition-transform">
              <Database className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Database
            </h2>
            <p className="text-gray-600 text-sm">
              จัดการตาราง สร้างตารางจาก Google Sheets และซิงค์ข้อมูล
            </p>
          </div>
        </Link>



        <Link href="/log">
          <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-yellow-500 group">
            <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl mb-4 group-hover:scale-110 transition-transform">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Logs
            </h2>
            <p className="text-gray-600 text-sm">
              ตรวจสอบประวัติการซิงค์และ log ต่างๆ ของระบบ
            </p>
          </div>
        </Link>

        <Link href="/settings">
          <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all cursor-pointer border-2 border-transparent hover:border-gray-500 group">
            <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl mb-4 group-hover:scale-110 transition-transform">
              <Settings className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              ตั้งค่า
            </h2>
            <p className="text-gray-600 text-sm">
              ตั้งค่าการเชื่อมต่อฐานข้อมูลและค่าต่างๆ ของระบบ
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
