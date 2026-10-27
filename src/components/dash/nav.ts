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
  House,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; to: string; icon: LucideIcon };

export const tenantNav: NavItem[] = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", to: "/campaigns", icon: Megaphone },
  { label: "Contacts", to: "/contacts", icon: Users },
  { label: "SMS", to: "/sms", icon: MessageSquare },
  { label: "Live Calls", to: "/live-calls", icon: PhoneCall },
  { label: "Agents", to: "/agents", icon: Headset },
  { label: "Team", to: "/team", icon: ListChecks },
  { label: "Call History", to: "/call-history", icon: History },
  { label: "Recordings", to: "/recordings", icon: AudioLines },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Phone System", to: "/phone-system", icon: Workflow },
  { label: "Automations", to: "/automations", icon: Zap },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Billing", to: "/billing", icon: CreditCard },
  { label: "Support", to: "/support", icon: LifeBuoy },
];

export const agentNav: NavItem[] = [{ label: "My day", to: "/agent", icon: House }];

export const adminNav: NavItem[] = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Tenants", to: "/admin/tenants", icon: Building2 },
  { label: "System Health", to: "/admin/system-health", icon: Activity },
  { label: "Billing & Revenue", to: "/admin/revenue", icon: CreditCard },
  { label: "Support", to: "/admin/support", icon: LifeBuoy },
  { label: "Outreach", to: "/admin/outreach", icon: Announce },
];
