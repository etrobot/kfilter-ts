import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";
import { LayoutDashboard, Home, LineChart } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function Header() {
  // 获取用户session
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => authClient.getSession(),
  });

  const baseLinks = [
    { to: "/", label: "Home", icon: Home },
    { to: "/sentiment", label: "情绪看板", icon: LineChart },
  ] as const;

  // 只有admin用户才能看到dashboard链接
  const adminLinks = session?.data?.user?.isAdmin 
    ? [{ to: "/dashboard", label: "管理面板", icon: LayoutDashboard }]
    : [];

  const links = [...baseLinks, ...adminLinks];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-6">
        <div className="mr-8 hidden md:flex">
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <span className="hidden font-bold sm:inline-block">KFilter</span>
          </Link>
        </div>

        <nav className="flex items-center gap-1 text-sm font-medium">
          {links.map(({ to, label, icon: Icon }) => {
            return (
              <Link
                key={to}
                to={to}
                activeProps={{
                  className: "bg-accent text-accent-foreground shadow-sm",
                }}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "h-9 px-4 py-2 transition-all hover:bg-accent/50 data-[status=active]:bg-secondary"
                )}
              >
                <Icon className="mr-2 h-4 w-4 opacity-70" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
