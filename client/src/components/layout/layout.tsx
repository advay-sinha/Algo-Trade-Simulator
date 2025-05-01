import { useState } from "react";
import Sidebar from "./sidebar";
import { Button } from "@/components/ui/button";
import { Menu, Bell } from "lucide-react";
import BotpressChat from "../dashboard/BotpressChat";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
      {/* Mobile Sidebar (shown when sidebarOpen is true) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)}></div>
          <div className="fixed inset-y-0 left-0 flex flex-col z-50 w-64 bg-white dark:bg-gray-800 shadow-lg">
            <Sidebar isMobile onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="w-64 flex flex-col fixed h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <Sidebar />
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col flex-1 lg:pl-64 w-full">
        <BotpressChat/>
        {/* Mobile Header */}
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="px-4 text-gray-500 dark:text-gray-400"
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 flex justify-between items-center px-4">
            <h1 className="text-xl font-bold text-primary">AlgoTrade</h1>
            <Button variant="ghost" size="icon" className="text-gray-500 dark:text-gray-400">
              <Bell className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Page Content */}
        <main className="flex-1 p-0">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
            </div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}