"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { CalendarBlank, ChartBar, Gear, SignOut, Tooth, Users, type Icon } from "@phosphor-icons/react";

import { signOutStaff } from "@/app/danas/actions";
import type { ActionResult } from "@/lib/action-result";
import type { StaffRole } from "@/lib/auth";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { staffMenuItems, usesStaffShellMenu } from "./staff-menu";

const ICONS: Record<string, Icon> = {
  "/danas": CalendarBlank,
  "/pacijenti": Users,
  "/podesavanja": Gear,
  "/statistika": ChartBar,
};

export function AppMenuClient({
  role,
  children,
}: {
  role: StaffRole | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signOutStaff, null);
  const signOutError = result && !result.ok ? result.error : null;

  if (!usesStaffShellMenu(pathname)) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <Sidebar aria-label="Meni ordinacije">
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
                {staffMenuItems(role).map((item) => {
                  const ItemIcon = ICONS[item.href] ?? CalendarBlank;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isCurrent(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <ItemIcon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <form action={formAction}>
            {signOutError ? (
              <p role="alert" className="px-2 text-sm text-destructive">
                {signOutError}
              </p>
            ) : null}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton type="submit" tooltip="Odjava" disabled={pending}>
                  <SignOut />
                  <span>Odjava</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </form>
        </SidebarFooter>
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

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
