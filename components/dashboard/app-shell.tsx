"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

import { logout } from "@/app/auth/actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Invoices",
    href: "/dashboard/invoices",
    icon: ReceiptText,
  },
  {
    name: "Estimates",
    href: "/dashboard/estimates",
    icon: FileText,
  },
  {
    name: "Clients",
    href: "/dashboard/clients",
    icon: UsersRound,
  },
  {
    name: "Follow-ups",
    href: "/dashboard/recovery",
    icon: ClipboardCheck,
  },
  {
    name: "Reminders",
    href: "/dashboard/reminders",
    icon: Bell,
  },
  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function BrandMark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-lg bg-green-700 text-sm font-bold text-white shadow-sm">
        RR
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-tight">
          Revenue Recovery
        </div>
        <div className="truncate text-xs text-muted-foreground">
          Contractor collections
        </div>
      </div>
    </Link>
  )
}

function SidebarNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {navigation.map((item) => {
        const active = isActivePath(pathname, item.href)
        const Icon = item.icon
        const link = (
          <Link
            href={item.href}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-green-50 text-green-800 ring-1 ring-green-100 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-900/60"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4", active && "text-green-700")} />
            <span>{item.name}</span>
          </Link>
        )

        return mobile ? (
          <SheetClose asChild key={item.href}>
            {link}
          </SheetClose>
        ) : (
          <div key={item.href}>{link}</div>
        )
      })}
    </nav>
  )
}

function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center px-5">
        <BrandMark />
      </div>
      <SidebarNav />
      <div className="px-3 pb-4 pt-2">
        <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-green-950 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-green-700" />
            You stay in control
          </div>
          <p className="mt-1.5 text-xs leading-5 text-green-800 dark:text-green-200">
            Every follow-up is drafted for your review. Nothing sends without
            your approval.
          </p>
        </div>
      </div>
    </aside>
  )
}

function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[min(20rem,calc(100vw-1rem))] bg-white p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Move between dashboard sections.</SheetDescription>
        </SheetHeader>
        <div className="flex h-full w-full flex-col">
          <div className="flex h-16 items-center px-5">
            <BrandMark />
          </div>
          <SidebarNav mobile />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function getInitials(email?: string) {
  if (!email) {
    return "OW"
  }

  const name = email.split("@")[0]
  const parts = name.split(/[._-]/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return name.slice(0, 2).toUpperCase()
}

function TopBar({ userEmail }: { userEmail?: string }) {
  const [isPending, startTransition] = useTransition()
  const displayName = userEmail?.split("@")[0] || "Owner"
  const initials = getInitials(userEmail)

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-6 lg:px-8">
      <MobileSidebar />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="size-7">
                <AvatarFallback className="bg-green-100 text-green-800 text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">
                {displayName}
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">Owner workspace</div>
              <div className="text-xs font-normal text-muted-foreground">
                {userEmail || "Signed in"}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">Account settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isPending}
              onSelect={(event) => {
                event.preventDefault()
                startTransition(() => {
                  void logout()
                })
              }}
            >
              <LogOut className="size-4" />
              {isPending ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode
  userEmail?: string
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-foreground dark:bg-zinc-950">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar userEmail={userEmail} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  )
}
