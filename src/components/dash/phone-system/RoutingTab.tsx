import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
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
import {
  nextId,
  ringStrategyLabels,
  type FallbackDestination,
  type IvrMenu,
  type RingStrategy,
  type RoutingRule,
} from "@/lib/phone-system-data";

const fallbackLabels: Record<FallbackDestination, string> = {
  voicemail: "Voicemail",
  external_number: "External number",
  extension: "Specific extension",
};

export function RoutingTab({
  routing,
  setRouting,
  menus,
}: {
  routing: RoutingRule;
  setRouting: Dispatch<SetStateAction<RoutingRule>>;
  menus: IvrMenu[];
}) {
  function patch(update: Partial<RoutingRule>) {
    setRouting((prev) => ({ ...prev, ...update }));
  }

  function move(index: number, dir: -1 | 1) {
    setRouting((prev) => {
      const order = [...prev.ringOrder];
      const target = index + dir;
      if (target < 0 || target >= order.length) return prev;
      [order[index], order[target]] = [order[target] as (typeof order)[number], order[index] as (typeof order)[number]];
      return { ...prev, ringOrder: order };
    });
  }

  function addStep() {
    setRouting((prev) => ({
      ...prev,
      ringOrder: [...prev.ringOrder, { id: nextId("ring"), name: "New agent", ext: "", ringSeconds: 20 }],
    }));
  }

  function removeStep(id: string) {
    setRouting((prev) => ({ ...prev, ringOrder: prev.ringOrder.filter((s) => s.id !== id) }));
  }

  function updateStep(id: string, update: Partial<RoutingRule["ringOrder"][number]>) {
    setRouting((prev) => ({
      ...prev,
      ringOrder: prev.ringOrder.map((s) => (s.id === id ? { ...s, ...update } : s)),
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Call routing"
        description="How inbound calls ring your team before falling back"
        actions={
          <Button size="sm" onClick={() => toast.success("Call routing saved")}>
            <Save className="size-3.5" /> Save
          </Button>
        }
        bodyClassName="p-5"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Ring strategy</Label>
            <Select
              value={routing.strategy}
              onValueChange={(strategy) => patch({ strategy: strategy as RingStrategy })}
            >
              <SelectTrigger className="sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ringStrategyLabels) as RingStrategy[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {ringStrategyLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {routing.strategy !== "sequential" && (
              <p className="text-xs text-muted-foreground">
                Inbound calls currently ring your list in order regardless of this setting — each
                destination gets its full ring time before the next one is tried. Outbound and
                agent-side behaviour still follow the strategy you pick here.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:max-w-sm">
            <Label htmlFor="dial-code">Default country code</Label>
            <Input
              id="dial-code"
              placeholder="234"
              inputMode="numeric"
              value={routing.defaultDialCode ?? ""}
              onChange={(e) => patch({ defaultDialCode: e.target.value.replace(/[^\d]/g, "") })}
            />
            <p className="text-xs text-muted-foreground">
              Used when an extension forwards to a number written the local way, like
              <span className="font-mono"> 08034064184</span>. Nigeria is 234, the UK 44, the US 1.
              Numbers already stored with a <span className="font-mono">+</span> are left alone.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Ring order</Label>
              <Button type="button" size="sm" variant="outline" onClick={addStep}>
                <Plus className="size-3.5" /> Add target
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {routing.ringOrder.map((step, i) => (
                <div key={step.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {i + 1}
                  </span>
                  <Input
                    className="w-40"
                    value={step.name}
                    onChange={(e) => updateStep(step.id, { name: e.target.value })}
                    aria-label="Name"
                  />
                  <Input
                    className="w-24 font-mono"
                    placeholder="Ext"
                    value={step.ext}
                    onChange={(e) => updateStep(step.id, { ext: e.target.value })}
                    aria-label="Extension"
                  />
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      className="w-20"
                      value={step.ringSeconds}
                      onChange={(e) => updateStep(step.id, { ringSeconds: Number(e.target.value) || 0 })}
                      aria-label="Ring seconds"
                    />
                    sec
                  </div>
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={i === routing.ringOrder.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeStep(step.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {routing.ringOrder.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No ring targets — calls will go straight to the fallback below.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="route-timeout">Overall timeout (seconds)</Label>
              <Input
                id="route-timeout"
                type="number"
                min={10}
                max={300}
                value={routing.timeoutSeconds}
                onChange={(e) => patch({ timeoutSeconds: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>If unanswered, send to</Label>
              <Select
                value={routing.fallback}
                onValueChange={(fallback) => patch({ fallback: fallback as FallbackDestination })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(fallbackLabels) as FallbackDestination[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {fallbackLabels[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {routing.fallback !== "voicemail" && (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="route-fallback-target">
                  {routing.fallback === "external_number" ? "Phone number" : "Extension"}
                </Label>
                <Input
                  id="route-fallback-target"
                  value={routing.fallbackTarget}
                  onChange={(e) => patch({ fallbackTarget: e.target.value })}
                  placeholder={routing.fallback === "external_number" ? "+1 415 555 0199" : "1042"}
                />
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="After-hours behavior" bodyClassName="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Route to after-hours menu outside business hours</p>
            <p className="text-xs text-muted-foreground">Uses the schedule from the Business Hours tab</p>
          </div>
          <Switch
            checked={routing.afterHoursToMenu}
            onCheckedChange={(afterHoursToMenu) => patch({ afterHoursToMenu })}
          />
        </div>
        {routing.afterHoursToMenu && (
          <div className="mt-4 flex flex-col gap-2 sm:max-w-sm">
            <Label>After-hours menu</Label>
            <Select value={routing.afterHoursMenuId} onValueChange={(afterHoursMenuId) => patch({ afterHoursMenuId })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {menus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Panel>
    </div>
  );
}
