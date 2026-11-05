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

import type { AgentPermissions } from "@/backend/permissions";

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

/**
 * What an agent's menu holds: only what the owner switched on. Billing, plan, settings, automations,
 * the agents list and the carrier connection are never in it.
 */
export function agentNavGroups(p: AgentPermissions | null): NavGroup[] {
  const groups: NavGroup[] = [{ label: "Workspace", items: agentNav }];
  const calling: NavItem[] = [];
  if (p && p.contacts !== "none") calling.push({ label: "Contacts", to: "/contacts", icon: Users });
  if (p?.dial) calling.push({ label: "Campaigns", to: "/campaigns", icon: Megaphone });
  if (p?.sms) calling.push({ label: "SMS", to: "/sms", icon: MessageSquare });
  if (p) calling.push({ label: "Call History", to: "/call-history", icon: History });
  if (p?.recordings) calling.push({ label: "Recordings", to: "/recordings", icon: AudioLines });
  if (p) calling.push({ label: "My stats", to: "/analytics", icon: BarChart3 });
  if (calling.length) groups.push({ label: "Calling", items: calling });
  if (p && p.phoneSystem !== "none") groups.push({ label: "Phone system", items: [{ label: "Phone System", to: "/phone-system", icon: Workflow }] });
  return groups;
}

/** The website pages an agent may open besides their own day. A page not listed here sends them back to My day. */
export const AGENT_PAGES = ["/contacts", "/campaigns", "/sms", "/call-history", "/recordings", "/analytics", "/phone-system"];

export const adminNav: NavItem[] = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Tenants", to: "/admin/tenants", icon: Building2 },
  { label: "System Health", to: "/admin/system-health", icon: Activity },
  { label: "Billing & Revenue", to: "/admin/revenue", icon: CreditCard },
  { label: "Support", to: "/admin/support", icon: LifeBuoy },
  { label: "Outreach", to: "/admin/outreach", icon: Announce },
  { label: "Payment links", to: "/admin/payments", icon: Wallet },
];
