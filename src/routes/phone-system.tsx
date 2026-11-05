import { useMyAccess } from "@/lib/access-api";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Shell } from "@/components/dash/Shell";
import { Panel } from "@/components/dash/bits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectionTab } from "@/components/dash/phone-system/ConnectionTab";
import { InboundTab } from "@/components/dash/phone-system/InboundTab";
import { OutboundTab } from "@/components/dash/phone-system/OutboundTab";
import { NumbersTab } from "@/components/dash/phone-system/NumbersTab";
import { IvrTab } from "@/components/dash/phone-system/IvrTab";
import { RoutingTab } from "@/components/dash/phone-system/RoutingTab";
import { BusinessHoursTab } from "@/components/dash/phone-system/BusinessHoursTab";
import { ExtensionsTab } from "@/components/dash/phone-system/ExtensionsTab";
import { VoicemailTab } from "@/components/dash/phone-system/VoicemailTab";
import {
  businessHours as defaultHours,
  extensions as defaultExtensions,
  ivrMenus as defaultMenus,
  phoneNumberList as defaultNumbers,
  routingRule as defaultRouting,
  voicemailSettings as defaultVoicemail,
  type BusinessHoursConfig,
  type Extension,
  type IvrMenu,
  type PhoneNumber,
  type RoutingRule,
  type VoicemailSettings,
} from "@/lib/phone-system-data";
import { getPhoneSystem, savePhoneNumbers, savePhoneSystem } from "@/lib/phone-system-api";

export const Route = createFileRoute("/phone-system")({
  head: () => ({
    meta: [
      { title: "Phone System — Kchel Dialer" },
      {
        name: "description",
        content:
          "Configure IVR auto-attendant menus, call routing, business hours, extensions and voicemail.",
      },
      { property: "og:title", content: "Phone System — Kchel Dialer" },
      {
        property: "og:description",
        content: "Build IVR menus, routing rules and business hours for your inbound numbers.",
      },
    ],
  }),
  component: PhoneSystemPage,
});

const AUTOSAVE_DELAY_MS = 800;

/** Switches every field and button inside off. The server refuses a view-only agent's save as well. */
function Lock({ readOnly, children }: { readOnly: boolean; children: React.ReactNode }) {
  return (
    <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      {children}
    </fieldset>
  );
}

/** What an agent sees where the owner's carrier connection would be. */
function LineNote() {
  return (
    <p className="rounded-lg border border-border bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
      The phone line connection is set up by the workspace owner. If calls are not working, tell them.
    </p>
  );
}

function PhoneSystemPage() {
  const access = useMyAccess();
  // An agent with "view" only looks. Until we know what they may do, they only look.
  const readOnly = access.isAgent && access.permissions?.phoneSystem !== "edit";
  const hideLine = access.isAgent;
  const [numbers, setNumbers] = useState<PhoneNumber[]>(defaultNumbers);
  const [menus, setMenus] = useState<IvrMenu[]>(defaultMenus);
  const [routing, setRouting] = useState<RoutingRule>(defaultRouting);
  const [hours, setHours] = useState<BusinessHoursConfig>(defaultHours);
  const [extensions, setExtensions] = useState<Extension[]>(defaultExtensions);
  const [voicemail, setVoicemail] = useState<VoicemailSettings>(defaultVoicemail);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState("inbound");

  // Suppresses the autosave that would otherwise fire from the initial load
  // writing state — we don't want mounting the page to count as an edit.
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getPhoneSystem();
        if (cancelled) return;
        if (loaded.saved) {
          setMenus(loaded.menus);
          setExtensions(loaded.extensions);
          setRouting(loaded.routing);
          setHours(loaded.businessHours);
          setVoicemail(loaded.voicemail);
        }
        // Numbers are stored separately and are authoritative either way.
        setNumbers(loaded.numbers);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not load your phone system.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Let the state settle before arming autosave.
          setTimeout(() => {
            hydrated.current = true;
          }, 0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced autosave — every tab mutates local state directly, so rather
  // than threading a save callback through six components we persist whenever
  // the config settles.
  useEffect(() => {
    if (!hydrated.current || readOnly) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await savePhoneSystem({ menus, extensions, routing, businessHours: hours, voicemail });
        setSavedAt(new Date());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save changes.");
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [menus, extensions, routing, hours, voicemail, readOnly]);

  useEffect(() => {
    if (!hydrated.current || readOnly) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await savePhoneNumbers(numbers);
        setSavedAt(new Date());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save numbers.");
      } finally {
        setSaving(false);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [numbers, readOnly]);

  if (loading) {
    return (
      <Shell scope="tenant" title="Phone System" description="Loading your configuration…">
        <Panel bodyClassName="flex items-center justify-center gap-2 p-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell
      scope="tenant"
      title="Phone System"
      description="Numbers, IVR menus, call routing, business hours, extensions and voicemail"
      actions={
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Saving…
            </>
          ) : savedAt ? (
            <>
              <Check className="size-3.5 text-success" /> Saved{" "}
              {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </>
          ) : readOnly ? (
            "View only"
          ) : (
            "Changes save automatically"
          )}
        </span>
      }
    >
      {readOnly && (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          You can look at the phone system here. Changing it is up to the workspace owner.
        </p>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        {/* Nine tabs wrap onto three stacked rows on a phone, which buries the
            page content below a block of chrome. Scrolling the strip sideways
            keeps it one row at every width. */}
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto sm:flex-wrap sm:justify-center">
          <TabsTrigger value="inbound">Inbound</TabsTrigger>
          {!hideLine && <TabsTrigger value="outbound">Outbound</TabsTrigger>}
          {!hideLine && <TabsTrigger value="connection">Connection</TabsTrigger>}
          <TabsTrigger value="numbers">Numbers</TabsTrigger>
          <TabsTrigger value="ivr">IVR Menus</TabsTrigger>
          <TabsTrigger value="routing">Call Routing</TabsTrigger>
          <TabsTrigger value="hours">Business Hours</TabsTrigger>
          <TabsTrigger value="extensions">Extensions</TabsTrigger>
          <TabsTrigger value="voicemail">Voicemail</TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-4">
          <Lock readOnly={readOnly}>
          <InboundTab
            numbers={numbers}
            menus={menus}
            extensions={extensions}
            routing={routing}
            voicemail={voicemail}
            businessHours={hours}
            onNavigate={setTab}
          />
          </Lock>
        </TabsContent>
        <TabsContent value="outbound" className="mt-4">
          <Lock readOnly={readOnly}>
          {hideLine ? <LineNote /> : <OutboundTab onNavigate={setTab} />}
          </Lock>
        </TabsContent>
        <TabsContent value="connection" className="mt-4">
          <Lock readOnly={readOnly}>
          {hideLine ? <LineNote /> : <ConnectionTab />}
          </Lock>
        </TabsContent>
        <TabsContent value="numbers" className="mt-4">
          <Lock readOnly={readOnly}>
          <NumbersTab numbers={numbers} setNumbers={setNumbers} menus={menus} />
          </Lock>
        </TabsContent>
        <TabsContent value="ivr" className="mt-4">
          <Lock readOnly={readOnly}>
          <IvrTab menus={menus} setMenus={setMenus} />
          </Lock>
        </TabsContent>
        <TabsContent value="routing" className="mt-4">
          <Lock readOnly={readOnly}>
          <RoutingTab routing={routing} setRouting={setRouting} menus={menus} />
          </Lock>
        </TabsContent>
        <TabsContent value="hours" className="mt-4">
          <Lock readOnly={readOnly}>
          <BusinessHoursTab hours={hours} setHours={setHours} />
          </Lock>
        </TabsContent>
        <TabsContent value="extensions" className="mt-4">
          <Lock readOnly={readOnly}>
          <ExtensionsTab extensions={extensions} setExtensions={setExtensions} />
          </Lock>
        </TabsContent>
        <TabsContent value="voicemail" className="mt-4">
          <Lock readOnly={readOnly}>
          <VoicemailTab voicemail={voicemail} setVoicemail={setVoicemail} />
          </Lock>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
