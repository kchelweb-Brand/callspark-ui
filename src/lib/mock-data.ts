export const callVolume7d = [
  { day: "Mon", calls: 1180, connected: 402 },
  { day: "Tue", calls: 1420, connected: 511 },
  { day: "Wed", calls: 1310, connected: 468 },
  { day: "Thu", calls: 1590, connected: 604 },
  { day: "Fri", calls: 1725, connected: 690 },
  { day: "Sat", calls: 940, connected: 288 },
  { day: "Sun", calls: 612, connected: 171 },
];

export const activityFeed = [
  { id: 1, time: "09:41", text: "Agent Mara Owusu connected with +1 415 555 0134", kind: "connected" },
  { id: 2, time: "09:40", text: "Campaign “Q3 Renewals” loaded 1,240 contacts", kind: "info" },
  { id: 3, time: "09:38", text: "Voicemail detected — +1 213 555 0980", kind: "warning" },
  { id: 4, time: "09:36", text: "Agent Dane Whitlock entered wrap-up (2m 14s call)", kind: "info" },
  { id: 5, time: "09:33", text: "SIP trunk latency spike resolved (edge-02)", kind: "warning" },
  { id: 6, time: "09:30", text: "Agent Priya Nair marked lead as Qualified", kind: "connected" },
  { id: 7, time: "09:26", text: "Failed dial attempt — carrier rejected (code 486)", kind: "error" },
  { id: 8, time: "09:21", text: "Campaign “Winback July” finished dialing list", kind: "info" },
];

export const campaigns = [
  { id: "cmp_01", name: "Q3 Renewals", status: "Active", contacts: 12480, calls: 8412, connect: 38.4, owner: "Mara Owusu" },
  { id: "cmp_02", name: "Winback July", status: "Paused", contacts: 6420, calls: 6420, connect: 24.1, owner: "Dane Whitlock" },
  { id: "cmp_03", name: "Enterprise Outbound", status: "Active", contacts: 2140, calls: 1188, connect: 51.2, owner: "Priya Nair" },
  { id: "cmp_04", name: "Support Follow-up", status: "Scheduled", contacts: 3980, calls: 0, connect: 0, owner: "Ines Duarte" },
  { id: "cmp_05", name: "Trial Nurture", status: "Active", contacts: 9120, calls: 4402, connect: 31.7, owner: "Mara Owusu" },
  { id: "cmp_06", name: "Cold List — Midwest", status: "Draft", contacts: 0, calls: 0, connect: 0, owner: "Tomas Feld" },
  { id: "cmp_07", name: "Renewal Escalations", status: "Completed", contacts: 1520, calls: 1520, connect: 44.9, owner: "Priya Nair" },
];

export const liveQueue = [
  { agent: "Mara Owusu", ext: "1042", status: "On call", contact: "Bridgewater Ltd", number: "+1 415 555 0134", duration: "04:12", campaign: "Q3 Renewals" },
  { agent: "Dane Whitlock", ext: "1043", status: "Wrap-up", contact: "Nordic Freight", number: "+1 646 555 0192", duration: "00:38", campaign: "Trial Nurture" },
  { agent: "Priya Nair", ext: "1044", status: "On call", contact: "Halcyon Group", number: "+44 20 7946 0102", duration: "11:47", campaign: "Enterprise Outbound" },
  { agent: "Ines Duarte", ext: "1045", status: "Available", contact: "—", number: "—", duration: "—", campaign: "Q3 Renewals" },
  { agent: "Tomas Feld", ext: "1046", status: "On call", contact: "Kestrel Media", number: "+1 312 555 0770", duration: "02:03", campaign: "Winback July" },
  { agent: "Ayo Bello", ext: "1047", status: "Available", contact: "—", number: "—", duration: "—", campaign: "Trial Nurture" },
  { agent: "Lena Ford", ext: "1048", status: "Offline", contact: "—", number: "—", duration: "—", campaign: "—" },
];

export const waitingQueue = [
  { position: 1, number: "+1 917 555 0044", waiting: "00:22", campaign: "Q3 Renewals" },
  { position: 2, number: "+1 503 555 0781", waiting: "00:47", campaign: "Trial Nurture" },
  { position: 3, number: "+1 305 555 0118", waiting: "01:12", campaign: "Winback July" },
];

export const contacts = [
  { id: "ct_01", name: "Bridgewater Ltd", person: "Alan Reece", number: "+1 415 555 0134", tags: ["Enterprise", "Renewal"], list: "Q3 Renewals", last: "Today 09:41" },
  { id: "ct_02", name: "Nordic Freight", person: "Kari Lund", number: "+1 646 555 0192", tags: ["Trial"], list: "Trial Nurture", last: "Today 09:36" },
  { id: "ct_03", name: "Halcyon Group", person: "Ruth Adeyemi", number: "+44 20 7946 0102", tags: ["Enterprise", "Hot"], list: "Enterprise Outbound", last: "Today 09:12" },
  { id: "ct_04", name: "Kestrel Media", person: "Marco Silva", number: "+1 312 555 0770", tags: ["Winback"], list: "Winback July", last: "Yesterday" },
  { id: "ct_05", name: "Pinegrove Dental", person: "Sara Kim", number: "+1 503 555 0781", tags: ["SMB"], list: "Trial Nurture", last: "Yesterday" },
  { id: "ct_06", name: "Vantage Logistics", person: "Ope Ajayi", number: "+1 305 555 0118", tags: ["Renewal", "Do not SMS"], list: "Q3 Renewals", last: "2 days ago" },
  { id: "ct_07", name: "Alder & Fitch", person: "Nina Kraus", number: "+1 917 555 0044", tags: ["SMB", "Hot"], list: "Cold List — Midwest", last: "3 days ago" },
  { id: "ct_08", name: "Trident Labs", person: "Yusuf Bello", number: "+1 213 555 0980", tags: ["Enterprise"], list: "Enterprise Outbound", last: "4 days ago" },
];

export const agents = [
  { name: "Mara Owusu", ext: "1042", status: "On call", calls: 92, talk: "3h 41m", connect: 41.2, csat: 4.8 },
  { name: "Dane Whitlock", ext: "1043", status: "Wrap-up", calls: 78, talk: "2h 58m", connect: 33.6, csat: 4.5 },
  { name: "Priya Nair", ext: "1044", status: "On call", calls: 64, talk: "4h 12m", connect: 52.0, csat: 4.9 },
  { name: "Ines Duarte", ext: "1045", status: "Available", calls: 71, talk: "2h 22m", connect: 29.8, csat: 4.3 },
  { name: "Tomas Feld", ext: "1046", status: "On call", calls: 55, talk: "1h 54m", connect: 26.4, csat: 4.1 },
  { name: "Ayo Bello", ext: "1047", status: "Available", calls: 47, talk: "1h 31m", connect: 35.1, csat: 4.6 },
  { name: "Lena Ford", ext: "1048", status: "Offline", calls: 0, talk: "0m", connect: 0, csat: 0 },
];

export const callHistory = [
  { id: "cl_9012", date: "Aug 22, 09:41", contact: "Bridgewater Ltd", number: "+1 415 555 0134", agent: "Mara Owusu", duration: "04:12", outcome: "Connected" },
  { id: "cl_9011", date: "Aug 22, 09:36", contact: "Nordic Freight", number: "+1 646 555 0192", agent: "Dane Whitlock", duration: "02:14", outcome: "Connected" },
  { id: "cl_9010", date: "Aug 22, 09:33", contact: "Trident Labs", number: "+1 213 555 0980", agent: "Priya Nair", duration: "00:31", outcome: "Voicemail" },
  { id: "cl_9009", date: "Aug 22, 09:26", contact: "Alder & Fitch", number: "+1 917 555 0044", agent: "Ines Duarte", duration: "00:00", outcome: "Failed" },
  { id: "cl_9008", date: "Aug 22, 09:18", contact: "Kestrel Media", number: "+1 312 555 0770", agent: "Tomas Feld", duration: "07:48", outcome: "Connected" },
  { id: "cl_9007", date: "Aug 22, 09:04", contact: "Vantage Logistics", number: "+1 305 555 0118", agent: "Ayo Bello", duration: "01:02", outcome: "No answer" },
  { id: "cl_9006", date: "Aug 22, 08:52", contact: "Pinegrove Dental", number: "+1 503 555 0781", agent: "Mara Owusu", duration: "03:27", outcome: "Connected" },
  { id: "cl_9005", date: "Aug 22, 08:41", contact: "Halcyon Group", number: "+44 20 7946 0102", agent: "Priya Nair", duration: "12:19", outcome: "Connected" },
  { id: "cl_9004", date: "Aug 22, 08:30", contact: "Bridgewater Ltd", number: "+1 415 555 0134", agent: "Dane Whitlock", duration: "00:00", outcome: "Busy" },
];

export const recordings = [
  { id: "rec_501", contact: "Halcyon Group", agent: "Priya Nair", date: "Aug 22, 08:41", duration: "12:19", size: "11.4 MB", tag: "Qualified" },
  { id: "rec_502", contact: "Kestrel Media", agent: "Tomas Feld", date: "Aug 22, 09:18", duration: "07:48", size: "7.2 MB", tag: "Follow-up" },
  { id: "rec_503", contact: "Bridgewater Ltd", agent: "Mara Owusu", date: "Aug 22, 09:41", duration: "04:12", size: "3.9 MB", tag: "Renewal" },
  { id: "rec_504", contact: "Pinegrove Dental", agent: "Mara Owusu", date: "Aug 22, 08:52", duration: "03:27", size: "3.1 MB", tag: "Qualified" },
  { id: "rec_505", contact: "Nordic Freight", agent: "Dane Whitlock", date: "Aug 22, 09:36", duration: "02:14", size: "2.0 MB", tag: "Objection" },
  { id: "rec_506", contact: "Vantage Logistics", agent: "Ayo Bello", date: "Aug 22, 09:04", duration: "01:02", size: "0.9 MB", tag: "No answer" },
];

export const outcomeBreakdown = [
  { name: "Connected", value: 3128 },
  { name: "Voicemail", value: 1642 },
  { name: "No answer", value: 2210 },
  { name: "Busy", value: 704 },
  { name: "Failed", value: 318 },
];

export const hourlyLoad = [
  { hour: "8a", calls: 180 },
  { hour: "9a", calls: 342 },
  { hour: "10a", calls: 410 },
  { hour: "11a", calls: 388 },
  { hour: "12p", calls: 214 },
  { hour: "1p", calls: 268 },
  { hour: "2p", calls: 396 },
  { hour: "3p", calls: 431 },
  { hour: "4p", calls: 359 },
  { hour: "5p", calls: 202 },
];

export const invoices = [
  { id: "INV-2026-0812", date: "Aug 1, 2026", amount: "$1,480.00", plan: "Scale", status: "Paid" },
  { id: "INV-2026-0711", date: "Jul 1, 2026", amount: "$1,480.00", plan: "Scale", status: "Paid" },
  { id: "INV-2026-0610", date: "Jun 1, 2026", amount: "$1,240.00", plan: "Scale", status: "Paid" },
  { id: "INV-2026-0509", date: "May 1, 2026", amount: "$620.00", plan: "Growth", status: "Paid" },
  { id: "INV-2026-0408", date: "Apr 1, 2026", amount: "$620.00", plan: "Growth", status: "Refunded" },
];

export const phoneNumbers = [
  { number: "+1 415 555 0100", label: "Main outbound", type: "Local", region: "US-CA", status: "Active" },
  { number: "+1 646 555 0110", label: "NY campaign", type: "Local", region: "US-NY", status: "Active" },
  { number: "+44 20 7946 0100", label: "UK enterprise", type: "Local", region: "GB", status: "Active" },
  { number: "+1 800 555 0199", label: "Inbound support", type: "Toll-free", region: "US", status: "Pending" },
];

/* ---------- Super admin ---------- */

export const tenants = [
  { id: "tn_01", company: "Bluewave Outreach", plan: "Scale", status: "Active", minutes: 184200, cap: 250000, agents: 42, joined: "Feb 12, 2025", mrr: "$1,480" },
  { id: "tn_02", company: "Nimbus Collections", plan: "Growth", status: "Active", minutes: 62100, cap: 100000, agents: 18, joined: "Apr 03, 2025", mrr: "$620" },
  { id: "tn_03", company: "Vertex Solar", plan: "Scale", status: "Suspended", minutes: 240900, cap: 250000, agents: 55, joined: "Nov 21, 2024", mrr: "$1,480" },
  { id: "tn_04", company: "Harbor Legal", plan: "Starter", status: "Trial", minutes: 4100, cap: 10000, agents: 4, joined: "Aug 09, 2026", mrr: "$0" },
  { id: "tn_05", company: "Cobalt Insurance", plan: "Enterprise", status: "Active", minutes: 812400, cap: 1000000, agents: 130, joined: "Jun 30, 2024", mrr: "$5,900" },
  { id: "tn_06", company: "Redpine Recruiting", plan: "Growth", status: "Active", minutes: 71800, cap: 100000, agents: 21, joined: "Jan 15, 2026", mrr: "$620" },
  { id: "tn_07", company: "Southgate Auto", plan: "Starter", status: "Past due", minutes: 9600, cap: 10000, agents: 6, joined: "Mar 27, 2026", mrr: "$180" },
  { id: "tn_08", company: "Lumen Health", plan: "Scale", status: "Active", minutes: 133400, cap: 250000, agents: 37, joined: "Sep 08, 2025", mrr: "$1,480" },
];

export const tenantGrowth = [
  { month: "Mar", tenants: 41, revenue: 22100 },
  { month: "Apr", tenants: 48, revenue: 26400 },
  { month: "May", tenants: 53, revenue: 29800 },
  { month: "Jun", tenants: 61, revenue: 34600 },
  { month: "Jul", tenants: 68, revenue: 39200 },
  { month: "Aug", tenants: 74, revenue: 43850 },
];

export const systemAlerts = [
  { id: "al_1", severity: "Critical", time: "09:12", source: "carrier/edge-02", message: "SIP 503 rate exceeded 4% for 3 minutes" },
  { id: "al_2", severity: "Warning", time: "08:54", source: "dialer/queue", message: "Queue depth above 400 for tenant Cobalt Insurance" },
  { id: "al_3", severity: "Warning", time: "08:31", source: "billing/webhook", message: "2 retries on invoice sync (Southgate Auto)" },
  { id: "al_4", severity: "Info", time: "07:58", source: "recordings/storage", message: "Nightly archive completed — 812 files" },
  { id: "al_5", severity: "Info", time: "06:40", source: "platform", message: "Auto-scaled media workers 6 → 9" },
];

export const systemMetrics = [
  { label: "Telnyx balance", value: "$8,412.60", note: "Auto top-up at $2,000", tone: "success" },
  { label: "Queue depth", value: "312", note: "Across 74 tenants", tone: "default" },
  { label: "Active calls", value: "1,284", note: "Peak today 1,610", tone: "default" },
  { label: "Error rate (1h)", value: "0.8%", note: "Threshold 2.0%", tone: "warning" },
];

export const revenueByTenant = [
  { company: "Cobalt Insurance", plan: "Enterprise", minutes: 812400, sip: "$1,240", mrr: "$5,900", total: "$7,140" },
  { company: "Bluewave Outreach", plan: "Scale", minutes: 184200, sip: "$420", mrr: "$1,480", total: "$1,900" },
  { company: "Vertex Solar", plan: "Scale", minutes: 240900, sip: "$510", mrr: "$1,480", total: "$1,990" },
  { company: "Lumen Health", plan: "Scale", minutes: 133400, sip: "$310", mrr: "$1,480", total: "$1,790" },
  { company: "Redpine Recruiting", plan: "Growth", minutes: 71800, sip: "$160", mrr: "$620", total: "$780" },
  { company: "Nimbus Collections", plan: "Growth", minutes: 62100, sip: "$140", mrr: "$620", total: "$760" },
];

export const sipSales = [
  { id: "sip_301", tenant: "Cobalt Insurance", credential: "Trunk × 4", date: "Aug 18, 2026", amount: "$480", status: "Provisioned" },
  { id: "sip_302", tenant: "Bluewave Outreach", credential: "Trunk × 2", date: "Aug 14, 2026", amount: "$240", status: "Provisioned" },
  { id: "sip_303", tenant: "Harbor Legal", credential: "Trunk × 1", date: "Aug 11, 2026", amount: "$120", status: "Pending" },
  { id: "sip_304", tenant: "Lumen Health", credential: "Trunk × 2", date: "Aug 05, 2026", amount: "$240", status: "Provisioned" },
];

export const supportTickets = [
  { id: "TK-4821", tenant: "Southgate Auto", subject: "Invoice past due — dialer locked", priority: "High", status: "Open", updated: "12m ago" },
  { id: "TK-4820", tenant: "Harbor Legal", subject: "SIP credential not provisioning", priority: "High", status: "In progress", updated: "48m ago" },
  { id: "TK-4818", tenant: "Nimbus Collections", subject: "CSV import mapping question", priority: "Low", status: "Waiting on customer", updated: "3h ago" },
  { id: "TK-4815", tenant: "Cobalt Insurance", subject: "Request: raise concurrency to 600", priority: "Medium", status: "In progress", updated: "5h ago" },
  { id: "TK-4809", tenant: "Vertex Solar", subject: "Appeal account suspension", priority: "High", status: "Escalated", updated: "1d ago" },
  { id: "TK-4802", tenant: "Lumen Health", subject: "Recording retention policy", priority: "Low", status: "Resolved", updated: "2d ago" },
];

/* ---------- SMS ---------- */

export const smsThreads = [
  {
    id: "th_01",
    contact: "Alan Reece",
    company: "Bridgewater Ltd",
    number: "+1 415 555 0134",
    unread: 2,
    last: "09:44",
    messages: [
      { id: 1, from: "them" as const, time: "09:31", text: "Hi — can you resend the renewal quote?" },
      { id: 2, from: "us" as const, time: "09:33", text: "Sure, sending it over now. Same seat count?" },
      { id: 3, from: "them" as const, time: "09:44", text: "Add 5 seats please. Also can we start Sept 1?" },
    ],
  },
  {
    id: "th_02",
    contact: "Sara Kim",
    company: "Pinegrove Dental",
    number: "+1 503 555 0781",
    unread: 0,
    last: "09:12",
    messages: [
      { id: 1, from: "us" as const, time: "08:58", text: "Reminder: your trial ends Friday." },
      { id: 2, from: "them" as const, time: "09:12", text: "Thanks — we'll upgrade this week." },
    ],
  },
  {
    id: "th_03",
    contact: "Marco Silva",
    company: "Kestrel Media",
    number: "+1 312 555 0770",
    unread: 1,
    last: "Yesterday",
    messages: [
      { id: 1, from: "us" as const, time: "16:04", text: "Following up on our call — good time tomorrow?" },
      { id: 2, from: "them" as const, time: "16:40", text: "Try me after 2pm CT." },
    ],
  },
  {
    id: "th_04",
    contact: "Nina Kraus",
    company: "Alder & Fitch",
    number: "+1 917 555 0044",
    unread: 0,
    last: "Mon",
    messages: [
      { id: 1, from: "us" as const, time: "11:20", text: "Hi Nina, sharing the pricing sheet you asked for." },
    ],
  },
];

export const smsCampaigns = [
  { id: "sms_01", name: "Renewal reminders — US", status: "Active", list: "Q3 Renewals", sent: 4820, delivered: 4712, replies: 388 },
  { id: "sms_02", name: "Trial day-7 nudge", status: "Active", list: "Trial Nurture", sent: 2410, delivered: 2366, replies: 201 },
  { id: "sms_03", name: "Winback offer", status: "Paused", list: "Winback July", sent: 1980, delivered: 1902, replies: 96 },
  { id: "sms_04", name: "Appointment confirmations", status: "Scheduled", list: "Support Follow-up", sent: 0, delivered: 0, replies: 0 },
];

export const smsVolume7d = [
  { day: "Mon", sent: 1820, replies: 142 },
  { day: "Tue", sent: 2140, replies: 188 },
  { day: "Wed", sent: 1960, replies: 161 },
  { day: "Thu", sent: 2480, replies: 214 },
  { day: "Fri", sent: 2710, replies: 246 },
  { day: "Sat", sent: 880, replies: 61 },
  { day: "Sun", sent: 420, replies: 22 },
];

export const smsByTenant = [
  { company: "Cobalt Insurance", sms: 184200, smsCost: "$1,842" },
  { company: "Bluewave Outreach", sms: 42310, smsCost: "$423" },
  { company: "Vertex Solar", sms: 51880, smsCost: "$519" },
  { company: "Lumen Health", sms: 30140, smsCost: "$301" },
  { company: "Redpine Recruiting", sms: 12060, smsCost: "$121" },
  { company: "Nimbus Collections", sms: 9840, smsCost: "$98" },
];
