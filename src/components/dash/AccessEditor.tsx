import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRESETS, PRESET_LABELS, type AgentPermissions, type PermissionPreset } from "@/backend/permissions";

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select value={value ? "1" : "0"} onValueChange={(v) => onChange(v === "1")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Yes</SelectItem>
          <SelectItem value="0">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** What an agent may do, as a set of plain choices plus one-click presets. */
export function AccessEditor({
  value,
  onChange,
}: {
  value: AgentPermissions;
  onChange: (next: AgentPermissions) => void;
}) {
  const set = <K extends keyof AgentPermissions>(key: K, v: AgentPermissions[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PRESETS) as PermissionPreset[]).map((p) => (
          <Button key={p} type="button" size="sm" variant="outline" title={PRESET_LABELS[p]} onClick={() => onChange({ ...PRESETS[p] })}>
            {p[0]!.toUpperCase() + p.slice(1)}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <YesNo label="Place and answer calls" value={value.dial} onChange={(v) => set("dial", v)} />
        <YesNo label="Power dialer" value={value.powerDialer} onChange={(v) => set("powerDialer", v)} />
        <div className="flex flex-col gap-2">
          <Label>Contacts they can see</Label>
          <Select value={value.contacts} onValueChange={(v) => set("contacts", v as AgentPermissions["contacts"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="assigned">Only ones on their tasks</SelectItem>
              <SelectItem value="all">All contacts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <YesNo label="Add new contacts" value={value.editContacts} onChange={(v) => set("editContacts", v)} />
        <div className="flex flex-col gap-2">
          <Label>Call history</Label>
          <Select value={value.callHistory} onValueChange={(v) => set("callHistory", v as AgentPermissions["callHistory"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="own">Only their own calls</SelectItem>
              <SelectItem value="all">Everyone's calls</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <YesNo label="Listen to recordings" value={value.recordings} onChange={(v) => set("recordings", v)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Agents never see billing, phone system, settings, automations or your team list. Changes take effect straight away.
      </p>
    </div>
  );
}
