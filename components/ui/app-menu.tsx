"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Buildings,
  CalendarBlank,
  ChartBar,
  FirstAid,
  Gear,
  ShieldCheck,
  SignIn,
  Tooth,
  Users,
  type Icon,
} from "@phosphor-icons/react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type MenuItem = {
  href: string;
  label: string;
  icon: Icon;
};

const items: MenuItem[] = [
  { href: "/", label: "Imenik", icon: Buildings },
  { href: "/za-ordinacije", label: "Za ordinacije", icon: FirstAid },
  { href: "/prijava", label: "Prijava", icon: SignIn },
  { href: "/danas", label: "Danas", icon: CalendarBlank },
  { href: "/pacijenti", label: "Pacijenti", icon: Users },
  { href: "/statistika", label: "Statistika", icon: ChartBar },
  { href: "/podesavanja", label: "Podešavanja", icon: Gear },
  { href: "/platforma", label: "Platforma", icon: ShieldCheck },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppMenu({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Tooth className="size-4" />
            </span>
            <span className="text-sm font-medium">DentAssist</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isCurrent(pathname, item.href)}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <div className="flex min-h-svh w-full flex-1 flex-col bg-background">
        <header className="flex h-12 items-center border-b px-3">
          <SidebarTrigger />
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </SidebarProvider>
  );
}
