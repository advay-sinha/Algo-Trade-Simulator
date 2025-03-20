import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, ChartLine, LayoutDashboard, LineChart, Bot, History, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: <LayoutDashboard className="mr-3 h-5 w-5" />,
    },
    {
      name: "Market Data",
      href: "/market-data",
      icon: <LineChart className="mr-3 h-5 w-5" />,
    },
    {
      name: "Strategies",
      href: "/strategies",
      icon: <Bot className="mr-3 h-5 w-5" />,
    },
    {
      name: "Simulation History",
      href: "/simulation-history",
      icon: <History className="mr-3 h-5 w-5" />,
    },
    {
      name: "Settings",
      href: "/settings",
      icon: <Settings className="mr-3 h-5 w-5" />,
    },
  ];

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 border-r border-border h-screen">
      {/* Logo */}
      <div className="px-6 py-4 flex items-center border-b border-border">
        <ChartLine className="h-6 w-6 text-primary mr-2" />
        <h1 className="text-xl font-bold">AlgoTrade</h1>
      </div>
      
      {/* Navigation Links */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <a
              className={cn(
                "flex items-center px-4 py-3 rounded-md font-medium",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              {item.icon}
              {item.name}
            </a>
          </Link>
        ))}
      </nav>
      
      {/* User Profile */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center">
          <Avatar>
            <AvatarFallback className="bg-muted">
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : user?.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="ml-3">
            <p className="text-sm font-medium">{user?.fullName || user?.username}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
