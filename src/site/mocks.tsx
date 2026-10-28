// Pictures of the product for the public website: the real screens, simplified,
// with made-up sample data. They are drawn in markup rather than shipped as
// screenshots so they stay sharp at every size and always use the brand colours.

import type { ReactNode } from "react";

import type { VisualKey } from "./content";

function Pane({ title, status, children, className = "" }: { title: string; status?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-rule bg-white text-ink shadow-pane ${className}`} aria-hidden>
      <div className="flex items-center justify-between border-b border-rule bg-mist px-4 py-2.5">
        <span className="text-[13px] font-bold text-ink/80">{title}</span>
        {status}
      </div>
      {children}
    </div>
  );
}

function Chip({ tone, children }: { tone: "green" | "blue" | "yellow" | "grey" | "red"; children: ReactNode }) {
  const cls = {
    green: "bg-brand-green/15 text-[#0a6f3c]",
    blue: "bg-brand-blue/12 text-[#27529f]",
    yellow: "bg-brand-yellow/30 text-[#6d5600]",
    grey: "bg-ink/8 text-slate",
    red: "bg-red-500/12 text-red-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

function Dot({ on = true }: { on?: boolean }) {
  return <span className={`inline-block size-2 rounded-full ${on ? "bg-brand-green" : "bg-ink/25"}`} />;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function Keypad() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <div key={k} className="flex h-11 items-center justify-center rounded-lg border border-rule bg-white text-lg font-bold text-ink">
          {k}
        </div>
      ))}
    </div>
  );
}

function DialerMock() {
  return (
    <Pane title="Dialer" status={<span className="flex items-center gap-1.5 text-xs font-semibold text-slate"><Dot /> Line registered</span>}>
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="rounded-lg bg-mist px-4 py-3">
            <p className="text-[11px] font-bold tracking-wider text-slate uppercase">Enter a number</p>
            <p className="mt-1 font-mono text-[22px] font-semibold tracking-tight">+1 415 555 0142</p>
          </div>
          <div className="mt-3">
            <Keypad />
          </div>
          <div className="mt-3 flex h-11 items-center justify-center rounded-lg bg-leaf text-[15px] font-bold text-white">Call</div>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-wider text-slate uppercase">Recent calls</p>
          <ul className="mt-2 divide-y divide-rule text-sm">
            {[
              ["Daniel Reyes", "2 min ago", "Connected", "green"],
              ["Priya Nair", "14 min ago", "Call back", "blue"],
              ["Northside Dental", "1 hr ago", "Voicemail", "yellow"],
              ["+1 415 555 0177", "Yesterday", "No answer", "grey"],
              ["Marcus Bell", "Yesterday", "Connected", "green"],
            ].map(([n, t, s, tone]) => (
              <li key={n} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{n}</p>
                  <p className="text-xs text-slate">{t}</p>
                </div>
                <Chip tone={tone as "green"}>{s}</Chip>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Pane>
  );
}

function QueueMock() {
  const rows: [string, string, string, "green" | "blue" | "yellow" | "grey"][] = [
    ["Maria Lopez", "Harbor Supply", "Calling in 3…", "grey"],
    ["Samir Haddad", "Haddad & Sons", "Connected", "green"],
    ["Joanne Park", "Park Logistics", "Call back", "blue"],
    ["Tobias Wren", "Wren Studio", "Voicemail", "yellow"],
    ["Aisha Bello", "Bello Foods", "Connected", "green"],
  ];
  return (
    <Pane title="Spring renewals" status={<Chip tone="green">Power dialer on</Chip>}>
      <div className="p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-slate uppercase">Progress</p>
            <p className="text-2xl font-extrabold tracking-tight">412 <span className="text-base font-semibold text-slate">of 660 done</span></p>
          </div>
          <div className="text-right text-xs text-slate">248 left<br />Wait between calls: 3s</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/8">
          <div className="h-full w-[62%] rounded-full bg-brand-green" />
        </div>
        <ul className="mt-4 divide-y divide-rule">
          {rows.map(([n, c, s, tone], i) => (
            <li key={n} className={`flex items-center justify-between gap-3 py-2.5 ${i === 0 ? "rounded-md bg-mist px-3 -mx-3" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{n}</p>
                <p className="truncate text-xs text-slate">{c}</p>
              </div>
              <Chip tone={tone}>{s}</Chip>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px] font-bold">
          {["Connected", "Call back", "Voicemail", "Not interested"].map((b, i) => (
            <div key={b} className={`rounded-md border py-2 ${i === 0 ? "border-leaf bg-leaf text-white" : "border-rule text-ink/80"}`}>{b}</div>
          ))}
        </div>
      </div>
    </Pane>
  );
}

function AiCallMock() {
  return (
    <Pane title="AI voice agent · Spring renewals" status={<span className="flex items-center gap-1.5 text-xs font-semibold text-slate"><Dot /> 02:14</span>}>
      <div className="space-y-3 p-5 text-sm">
        <div className="flex gap-2">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[10px] font-bold text-white">AI</span>
          <p className="rounded-2xl rounded-tl-sm bg-mist px-3.5 py-2.5 leading-snug">Hi Daniel, it's Sam, an automated assistant calling for Harbor Supply about your renewal. Is now an okay time?</p>
        </div>
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-leaf px-3.5 py-2.5 leading-snug text-white">Sure, but make it quick. Can you do Friday afternoon?</p>
        </div>
        <div className="flex gap-2">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[10px] font-bold text-white">AI</span>
          <p className="rounded-2xl rounded-tl-sm bg-mist px-3.5 py-2.5 leading-snug">I'll note Friday afternoon for you. The team will confirm the exact time with you.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          <Chip tone="green">Interested</Chip>
          <Chip tone="blue">Appointment requested: Friday pm</Chip>
          <Chip tone="grey">Summary saved</Chip>
        </div>
      </div>
    </Pane>
  );
}

function ReceptionistMock() {
  return (
    <Pane title="Call summary" status={<Chip tone="blue">AI receptionist</Chip>}>
      <div className="p-5 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-slate uppercase">Caller</p>
            <p className="mt-1 font-semibold">Jordan Bell</p>
            <p className="font-mono text-xs text-slate">+1 628 555 0190</p>
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-wider text-slate uppercase">Received</p>
            <p className="mt-1 font-semibold">Tuesday, 7:42 pm</p>
            <p className="text-xs text-slate">After hours · 1 min 48 s</p>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-mist p-3 leading-relaxed">Jordan wants a quote to replace two kitchen taps and asked for a call back tomorrow morning. Not urgent. Prefers calls before 10 am.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip tone="yellow">Call back</Chip>
          <Chip tone="grey">Message taken</Chip>
        </div>
        <ul className="mt-4 space-y-2 border-t border-rule pt-3 text-xs text-slate">
          <li className="flex items-center gap-2"><Dot /> Answered after hours</li>
          <li className="flex items-center gap-2"><Dot /> Transcript available</li>
        </ul>
      </div>
    </Pane>
  );
}

function AnalyticsMock() {
  const bars = [38, 52, 44, 66, 58, 74, 62, 81, 69, 90, 77, 84];
  return (
    <Pane title="Overview" status={<span className="text-xs font-semibold text-slate">Today</span>}>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Calls", "184"],
            ["Connect rate", "61%"],
            ["Avg handle", "4:12"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-rule p-3">
              <p className="text-[11px] font-bold tracking-wider text-slate uppercase">{l}</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[11px] font-bold tracking-wider text-slate uppercase">Calls by hour</p>
        <div className="mt-2 flex h-28 items-end gap-1.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-brand-blue/80" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate"><span>8 am</span><span>12</span><span>4 pm</span></div>
        <div className="mt-4 divide-y divide-rule border-t border-rule text-sm">
          {[
            ["Ngozi A.", "48 calls", "66%"],
            ["Luis M.", "41 calls", "59%"],
          ].map(([n, c, r]) => (
            <div key={n} className="flex items-center justify-between py-2">
              <span className="font-semibold">{n}</span>
              <span className="text-slate">{c} · {r} connected</span>
            </div>
          ))}
        </div>
      </div>
    </Pane>
  );
}

function MessagesMock() {
  return (
    <Pane title="+1 415 555 0142" status={<Chip tone="green">Text-back</Chip>}>
      <div className="space-y-3 bg-mist/60 p-5 text-sm">
        <p className="text-center text-[11px] font-semibold text-slate">Missed call · 9:12 am</p>
        <div className="flex">
          <p className="max-w-[82%] rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 leading-snug shadow-sm">Hi, this is Harbor Supply. Sorry we missed your call. What can we help you with? Reply here and we'll get back to you.</p>
        </div>
        <div className="flex justify-end">
          <p className="max-w-[75%] rounded-2xl rounded-br-sm bg-leaf px-3.5 py-2.5 leading-snug text-white">Looking for a quote on 40 pallets, can someone call me?</p>
        </div>
        <div className="flex">
          <p className="max-w-[82%] rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 leading-snug shadow-sm">Thanks! Someone will call you this morning.</p>
        </div>
      </div>
    </Pane>
  );
}

function FlowMock() {
  const Node = ({ title, sub, tone = "white" }: { title: string; sub?: string | undefined; tone?: "white" | "green" }) => (
    <div className={`rounded-lg border px-3.5 py-2.5 text-sm ${tone === "green" ? "border-leaf bg-leaf text-white" : "border-rule bg-white"}`}>
      <p className="font-bold">{title}</p>
      {sub && <p className={`text-xs ${tone === "green" ? "text-white/80" : "text-slate"}`}>{sub}</p>}
    </div>
  );
  return (
    <Pane title="Phone System · IVR menus" status={<Chip tone="green">Open now</Chip>}>
      <div className="p-5">
        <Node title="Main menu" sub="Thanks for calling Harbor Supply" tone="green" />
        <div className="ml-5 mt-3 space-y-3 border-l-2 border-rule pl-5">
          {[
            ["1", "Sales", "Rings the sales group"],
            ["2", "Support", "Extension 102"],
            ["3", "Opening hours", "Plays a recording"],
            ["0", "Operator", "Falls back to voicemail after 20 s"],
          ].map(([k, t, s]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-blue/12 text-sm font-extrabold text-[#27529f]">{k}</span>
              <div className="flex-1"><Node title={t!} sub={s} /></div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3 text-xs">
          <Chip tone="grey">Mon–Fri 9:00–17:30</Chip>
          <Chip tone="grey">After hours → AI receptionist</Chip>
        </div>
      </div>
    </Pane>
  );
}

function TeamMock() {
  return (
    <Pane title="Agents" status={<Chip tone="grey">4 of 8 seats</Chip>}>
      <ul className="divide-y divide-rule">
        {[
          ["Ngozi Adeyemi", "Supervisor", "All contacts · All history · Recordings", "green"],
          ["Luis Moreno", "Senior agent", "All contacts · Own history", "blue"],
          ["Hannah Cole", "Caller", "Contacts on open tasks · Own history", "grey"],
          ["Ibrahim Sule", "Invited", "Waiting for sign-in", "yellow"],
        ].map(([n, role, perms, tone]) => (
          <li key={n} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink/8 text-xs font-extrabold text-ink/70">{n!.split(" ").map((p) => p[0]).join("")}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{n}</p>
                <p className="truncate text-xs text-slate">{perms}</p>
              </div>
            </div>
            <Chip tone={tone as "green"}>{role}</Chip>
          </li>
        ))}
      </ul>
      <div className="border-t border-rule bg-mist px-5 py-3 text-xs text-slate">
        <span className="font-bold text-ink">New task</span> · Call the 25 renewals due this week → Hannah Cole
      </div>
    </Pane>
  );
}

function DesktopMock() {
  return (
    <Pane title="Kchel Dialer" status={<span className="flex items-center gap-1.5 text-xs font-semibold text-slate"><Dot /> Registered</span>}>
      <div className="grid grid-cols-[7.25rem_1fr] sm:grid-cols-[9.5rem_1fr]">
        <nav className="space-y-0.5 border-r border-rule bg-navy p-3 text-[12.5px] font-semibold text-white/75">
          {["Overview", "Dialer", "Contacts", "Campaigns", "Call history", "Recordings", "Automations", "Billing"].map((n, i) => (
            <div key={n} className={`rounded-md px-2.5 py-1.5 ${i === 1 ? "bg-white/12 text-white" : ""}`}>{n}</div>
          ))}
        </nav>
        <div className="p-5">
          <p className="text-[11px] font-bold tracking-wider text-slate uppercase">Incoming call</p>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-rule p-3">
            <div>
              <p className="font-bold">Priya Nair</p>
              <p className="font-mono text-xs text-slate">+1 628 555 0118</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white">Decline</span>
              <span className="rounded-md bg-leaf px-3 py-1.5 text-xs font-bold text-white">Answer</span>
            </div>
          </div>
          <p className="mt-4 text-[11px] font-bold tracking-wider text-slate uppercase">Team</p>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between rounded-md bg-mist px-3 py-2"><span>Task: follow up with Northside Dental</span><Chip tone="yellow">Due today</Chip></div>
            <div className="flex justify-between rounded-md bg-mist px-3 py-2"><span>Message from Ngozi</span><Chip tone="blue">New</Chip></div>
          </div>
        </div>
      </div>
    </Pane>
  );
}

const MAP: Record<VisualKey, () => ReactNode> = {
  dialer: DialerMock,
  queue: QueueMock,
  aicall: AiCallMock,
  analytics: AnalyticsMock,
  messages: MessagesMock,
  flow: FlowMock,
  team: TeamMock,
  desktop: DesktopMock,
  receptionist: ReceptionistMock,
};

export function Visual({ name }: { name: VisualKey }) {
  const Component = MAP[name];
  return <Component />;
}
