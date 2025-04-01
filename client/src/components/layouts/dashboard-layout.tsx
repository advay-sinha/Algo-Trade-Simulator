import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useMobile } from "@/hooks/use-mobile";

type NavItem = {
  name: string;
  path: string;
  icon: string;
};

const mainNavItems: NavItem[] = [
  { name: "Dashboard", path: "/", icon: "ri-dashboard-line" },
  { name: "Market Data", path: "/market", icon: "ri-line-chart-line" },
  { name: "Simulation", path: "/simulation", icon: "ri-robot-line" },
  { name: "Trading", path: "/trading", icon: "ri-exchange-line" },
  { name: "Trade History", path: "/history", icon: "ri-history-line" },
  { name: "Reports", path: "/reports", icon: "ri-bar-chart-2-line" },
];

const settingsNavItems: NavItem[] = [
  { name: "Profile", path: "/profile", icon: "ri-user-settings-line" },
  { name: "API Keys", path: "/api-keys", icon: "ri-key-line" },
];

const pageNames: Record<string, string> = {
  "/": "Dashboard",
  "/market": "Market Data",
  "/simulation": "Simulation",
  "/trading": "Trading",
  "/history": "Trade History",
  "/reports": "Performance Reports",
  "/profile": "User Profile",
  "/api-keys": "API Configuration",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useMobile();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const pageName = pageNames[location] || "Dashboard";

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`w-64 bg-gray-900 text-white flex-shrink-0 ${
          isMobile ? (sidebarOpen ? 'fixed inset-y-0 left-0 z-50' : 'hidden') : 'block'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-800">
            <h1 className="text-xl font-bold">AlgoTrade</h1>
            {isMobile && (
              <button 
                className="text-gray-400 hover:text-white"
                onClick={toggleSidebar}
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            )}
          </div>
          
          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-2">
              {mainNavItems.map((item) => (
                <li key={item.path}>
                  <Link href={item.path}>
                    <a
                      className={`flex items-center w-full px-4 py-2 text-sm rounded-md ${
                        location === item.path
                          ? "bg-primary text-white"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                      onClick={() => isMobile && setSidebarOpen(false)}
                    >
                      <i className={`${item.icon} mr-3 text-lg`}></i>
                      {item.name}
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
            
            <div className="mt-8 px-4">
              <h3 className="px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Settings
              </h3>
              <ul className="mt-2 space-y-1">
                {settingsNavItems.map((item) => (
                  <li key={item.path}>
                    <Link href={item.path}>
                      <a
                        className={`flex items-center w-full px-4 py-2 text-sm rounded-md ${
                          location === item.path
                            ? "bg-primary text-white"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                        onClick={() => isMobile && setSidebarOpen(false)}
                      >
                        <i className={`${item.icon} mr-3 text-lg`}></i>
                        {item.name}
                      </a>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
          
          {/* User Profile */}
          <div className="border-t border-gray-800 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                <span className="text-white font-medium">
                  {user?.username?.substring(0, 2)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-white">{user?.username || 'User'}</p>
                <p className="text-xs text-gray-400">{user?.email || ''}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="ml-auto text-gray-400 hover:text-white"
                aria-label="Logout"
              >
                <i className="ri-logout-box-r-line text-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay when mobile sidebar is open */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40"
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Mobile Sidebar Toggle Button */}
      {isMobile && !sidebarOpen && (
        <button
          className="fixed top-4 left-4 z-40 p-2 rounded-md bg-primary text-white shadow-md"
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <i className="ri-menu-line text-lg"></i>
        </button>
      )}
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm z-10">
          <div className="flex justify-between items-center py-4 px-6">
            <div className={isMobile ? "ml-10" : ""}>
              <h1 className="text-2xl font-semibold text-gray-800">{pageName}</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Market Status */}
              <div className="hidden md:flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <span className="w-2 h-2 mr-1 bg-green-500 rounded-full"></span>
                  Market Open
                </span>
              </div>
              
              {/* Search */}
              <div className="relative hidden sm:block">
                <input 
                  type="text" 
                  placeholder="Search stocks or crypto..." 
                  className="pl-10 pr-4 py-2 w-64 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <i className="ri-search-line absolute left-3 top-2.5 text-gray-400"></i>
              </div>
              
              {/* Notifications */}
              <button className="relative p-1 rounded-full text-gray-600 hover:text-gray-900 focus:outline-none">
                <i className="ri-notification-3-line text-xl"></i>
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500"></span>
              </button>
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}