import { useState } from "react";
import Sidebar from "./sidebar";
import { Button } from "@/components/ui/button";
import { Menu, Bell } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
      {/* Mobile Sidebar (shown when sidebarOpen is true) */}
      {sidebarOpen && (
        <Sidebar isMobile onClose={() => setSidebarOpen(false)} />
      )}

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
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
        <main className="flex-1 dark:bg-gray-900">
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
