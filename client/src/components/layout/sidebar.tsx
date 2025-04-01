import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ui/theme-provider";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ChartLine,
  Bot,
  Lightbulb,
  BarChart2,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isMobile, onClose }: SidebarProps) {
  const { user, logoutMutation } = useAuth();
  const { theme, setTheme } = useTheme();
  const [, navigate] = useLocation();
  const [location] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const navItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: <ChartLine className="h-5 w-5" />,
    },
    {
      name: "Simulator",
      path: "/simulator",
      icon: <Bot className="h-5 w-5" />,
    },
    {
      name: "Strategies",
      path: "/strategies", 
      icon: <Lightbulb className="h-5 w-5" />,
    },
    {
      name: "Performance",
      path: "/performance",
      icon: <BarChart2 className="h-5 w-5" />,
    },
    {
      name: "Settings",
      path: "/settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  const isActive = (path: string) => {
    return location === path;
  };

  const sidebarContent = (
    <>
      {/* Sidebar Header */}
      <div className="flex items-center justify-between h-16 px-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AlgoTrade</h1>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleTheme} 
          className="text-gray-600 dark:text-gray-300"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        {isMobile && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="ml-2 lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 pt-5 px-2 space-y-1">
        {navItems.map((item) => (
          <Button
            key={item.path}
            variant={isActive(item.path) ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => {
              navigate(item.path);
              if (isMobile && onClose) onClose();
            }}
          >
            {item.icon}
            <span className="ml-3">{item.name}</span>
          </Button>
        ))}
      </nav>
      
      {/* User Profile */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <Avatar>
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="ml-3 flex flex-col">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</span>
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0 text-xs text-primary justify-start"
              onClick={handleLogout}
            >
              <LogOut className="h-3 w-3 mr-1 text-gray-900 dark:text-gray-100" />
              <div className="text-gray-900 dark:text-gray-100">Logout</div>
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return isMobile ? (
    // Mobile Sidebar
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative flex flex-col w-64 max-w-xs h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        {sidebarContent}
      </div>
    </div>
  ) : (
    // Desktop Sidebar
    <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-30 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {sidebarContent}
    </div>
  );
}