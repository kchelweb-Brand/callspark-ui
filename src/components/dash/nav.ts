import {
  LayoutDashboard,
  Megaphone,
  Users,
  PhoneCall,
  MessageSquare,
  Headset,
  History,
  AudioLines,
  BarChart3,
  Settings,
  CreditCard,
  Building2,
  Activity,
  LifeBuoy,
  Workflow,
  Zap,
  ListChecks,
  Megaphone as Announce,
  Wallet,
  House,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; to: string; icon: LucideIcon };

export type NavGroup = { label: string; items: NavItem[] };

export const tenantNavGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
      { label: "Live Calls", to: "/live-calls", icon: PhoneCall },
      { label: "Agents", to: "/agents", icon: Headset },
      { label: "Team", to: "/team", icon: ListChecks },
      { label: "Analytics", to: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Calling",
    items: [
      { label: "Campaigns", to: "/campaigns", icon: Megaphone },
      { label: "Contacts", to: "/contacts", icon: Users },
      { label: "SMS", to: "/sms", icon: MessageSquare },
      { label: "Call History", to: "/call-history", icon: History },
      { label: "Recordings", to: "/recordings", icon: AudioLines },
    ],
  },
  {
    label: "Phone system",
    items: [
      { label: "Phone System", to: "/phone-system", icon: Workflow },
      { label: "Automations", to: "/automations", icon: Zap },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Settings", to: "/settings", icon: Settings },
      { label: "Billing", to: "/billing", icon: CreditCard },
      { label: "Support", to: "/support", icon: LifeBuoy },
    ],
  },
];

export const tenantNav: NavItem[] = tenantNavGroups.flatMap((g) => g.items);

export const agentNav: NavItem[] = [{ label: "My day", to: "/agent", icon: House }];

export const adminNav: NavItem[] = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Tenants", to: "/admin/tenants", icon: Building2 },
  { label: "System Health", to: "/admin/system-health", icon: Activity },
  { label: "Billing & Revenue", to: "/admin/revenue", icon: CreditCard },
  { label: "Support", to: "/admin/support", icon: LifeBuoy },
  { label: "Outreach", to: "/admin/outreach", icon: Announce },
  { label: "Payment links", to: "/admin/payments", icon: Wallet },
];
