import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LineChart, Bot, User } from "lucide-react";

export default function MobileNav() {
  const [location] = useLocation();
  
  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: <LayoutDashboard className="h-5 w-5 mb-1" />,
    },
    {
      name: "Markets",
      href: "/market-data",
      icon: <LineChart className="h-5 w-5 mb-1" />,
    },
    {
      name: "Strategies",
      href: "/strategies",
      icon: <Bot className="h-5 w-5 mb-1" />,
    },
    {
      name: "Profile",
      href: "/settings",
      icon: <User className="h-5 w-5 mb-1" />,
    },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <a
              className={cn(
                "flex flex-col items-center py-3",
                location === item.href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {item.icon}
              <span className="text-xs">{item.name}</span>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
