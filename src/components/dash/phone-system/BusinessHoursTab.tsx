import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nextId, type BusinessHoursConfig } from "@/lib/phone-system-data";

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
];

export function BusinessHoursTab({
  hours,
  setHours,
}: {
  hours: BusinessHoursConfig;
  setHours: Dispatch<SetStateAction<BusinessHoursConfig>>;
}) {
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newClosed, setNewClosed] = useState(true);

  function updateDay(index: number, patch: Partial<BusinessHoursConfig["days"][number]>) {
    setHours((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }));
  }

  function addException() {
    if (!newDate) {
      toast.error("Pick a date first.");
      return;
    }
    setHours((prev) => ({
      ...prev,
      exceptions: [
        ...prev.exceptions,
        { id: nextId("exc"), date: newDate, label: newLabel.trim() || "Exception", closed: newClosed },
      ],
    }));
    setNewDate("");
    setNewLabel("");
    setNewClosed(true);
    toast.success("Exception added");
  }

  function removeException(id: string) {
    setHours((prev) => ({ ...prev, exceptions: prev.exceptions.filter((e) => e.id !== id) }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Weekly schedule"
        description="Calls outside these hours follow your after-hours routing"
        actions={
          <Button size="sm" onClick={() => toast.success("Business hours saved")}>
            <Save className="size-3.5" /> Save
          </Button>
        }
        bodyClassName="p-5"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label>Timezone</Label>
            <Select value={hours.timezone} onValueChange={(timezone) => setHours((prev) => ({ ...prev, timezone }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {hours.days.map((d, i) => (
              <div key={d.day} className="flex flex-wrap items-center gap-3 p-3">
                <span className="w-28 shrink-0 text-sm font-semibold">{d.day}</span>
                <Switch checked={d.open} onCheckedChange={(open) => updateDay(i, { open })} />
                {d.open ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Input
                      type="time"
                      className="w-32"
                      value={d.start}
                      onChange={(e) => updateDay(i, { start: e.target.value })}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      className="w-32"
                      value={d.end}
                      onChange={(e) => updateDay(i, { end: e.target.value })}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed all day</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Holidays & exceptions" description="Override the weekly schedule for specific dates" bodyClassName="p-5">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exc-date" className="text-xs">Date</Label>
            <Input id="exc-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exc-label" className="text-xs">Label</Label>
            <Input
              id="exc-label"
              placeholder="Company offsite"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={newClosed} onCheckedChange={(v) => setNewClosed(v === true)} />
            Closed all day
          </label>
          <Button size="sm" onClick={addException}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-border">
          {hours.exceptions.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                <span className="font-mono text-muted-foreground">{e.date}</span> — {e.label}{" "}
                {e.closed ? <span className="text-muted-foreground">(closed)</span> : null}
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeException(e.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
          {hours.exceptions.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">No exceptions added.</li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
