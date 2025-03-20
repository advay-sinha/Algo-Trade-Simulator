import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Bell, 
  Menu, 
  Moon, 
  Search, 
  Sun, 
  ChartLine,
  X 
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  LineChart, 
  Bot, 
  History, 
  Settings, 
  LogOut 
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function TopNavbar() {
  const { theme, toggleTheme } = useTheme();
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

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
    setIsOpen(false);
  };

  return (
    <div className="bg-background shadow-sm z-10">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                  <div className="flex items-center">
                    <ChartLine className="h-6 w-6 text-primary mr-2" />
                    <h1 className="text-xl font-bold">AlgoTrade</h1>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <nav className="px-2 py-4 space-y-1">
                  {navItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <a
                        className={cn(
                          "flex items-center px-4 py-3 rounded-md font-medium",
                          location === item.href
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted"
                        )}
                        onClick={() => setIsOpen(false)}
                      >
                        {item.icon}
                        {item.name}
                      </a>
                    </Link>
                  ))}
                </nav>
                <div className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border">
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
              </SheetContent>
            </Sheet>
            {/* Mobile Logo */}
            <div className="flex items-center ml-4">
              <ChartLine className="h-6 w-6 text-primary mr-2" />
              <h1 className="text-xl font-bold">AlgoTrade</h1>
            </div>
          </div>
          
          {/* Search */}
          <div className="hidden md:flex md:flex-1 max-w-md">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input 
                type="text" 
                placeholder="Search markets, strategies..." 
                className="pl-10"
              />
            </div>
          </div>
          
          {/* Right Nav Items */}
          <div className="flex items-center">
            {/* Dark Mode Toggle */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground"
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            
            {/* Notifications */}
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <Bell className="h-5 w-5" />
            </Button>
            
            {/* Profile (Mobile Only) */}
            <div className="ml-3 relative md:hidden">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-muted">
                  {user?.fullName ? user.fullName.charAt(0).toUpperCase() : user?.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
