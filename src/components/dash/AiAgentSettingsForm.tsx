import { Loader2, PhoneCall } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AI_DELIVERY,
  AI_MODELS,
  AI_STYLES,
  AI_TIER_NOTE,
  AI_VOICEMAIL,
  AI_VOICES,
  MAX_VOICEMAIL_MESSAGE,
  findAiVoice,
  type AiAgentSettings,
  type AiVoiceTier,
} from "@/backend/ai-agent-options";
import { sampleAiCall } from "@/lib/workspace-api";

const TIERS: { id: AiVoiceTier; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "natural", label: "Natural" },
  { id: "premium", label: "Premium" },
];

const ACTIONS: { key: keyof AiAgentSettings["actions"]; label: string; hint: string }[] = [
  { key: "outcome", label: "Tag how each call went", hint: "Interested, call back, not interested… shows in Call History, and lets you call the right people again." },
  { key: "book", label: "Note appointment requests", hint: "It writes down the time someone asks for. It never promises a slot: you confirm it." },
  { key: "text", label: "Text details during the call", hint: "It can text the person once, only with information you gave it. Never to anyone who opted out." },
  { key: "transfer", label: "Hand over to a human", hint: "If someone asks for a person, or it is urgent, the call is connected to your transfer number." },
];

/**
 * How an AI voice agent sounds and what it may do. Used for the AI receptionist
 * and for AI campaigns. `showTransfer` is off where the transfer number is
 * asked for elsewhere on the same page.
 */
export function AiAgentSettingsForm({
  value,
  onChange,
  disabled = false,
  showVoicemail = false,
  showTransfer = false,
}: {
  value: AiAgentSettings;
  onChange: (next: AiAgentSettings) => void;
  disabled?: boolean;
  showVoicemail?: boolean;
  showTransfer?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const voice = findAiVoice(value.voice);
  const style = AI_STYLES.find((s) => s.id === value.style);
  const model = AI_MODELS.find((m) => m.id === value.model);
  const set = (patch: Partial<AiAgentSettings>) => onChange({ ...value, ...patch });
  // Only a campaign can read a script instead of holding a conversation.
  const script = showVoicemail && value.delivery === "script";
  const delivery = AI_DELIVERY.find((d) => d.id === value.delivery);

  async function hearIt() {
    setCalling(true);
    try {
      const result = await sampleAiCall(value, phone);
      toast.success(`Calling ${result.to} now`, { description: "Pick up to hear this voice. You can talk back to it." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't place the sample call.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {showVoicemail && (
        <div className="flex flex-col gap-2">
          <Label>How should it talk?</Label>
          <Select value={value.delivery} disabled={disabled} onValueChange={(v) => set({ delivery: v as AiAgentSettings["delivery"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_DELIVERY.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{delivery?.hint}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Voice</Label>
          <Select value={value.voice} disabled={disabled} onValueChange={(v) => set({ voice: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((tier) => (
                <SelectGroup key={tier.id}>
                  <SelectLabel>{tier.label}</SelectLabel>
                  {AI_VOICES.filter((v) => v.tier === tier.id).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{AI_TIER_NOTE[voice.tier]}</p>
        </div>

        {!script && (
        <div className="flex flex-col gap-2">
          <Label>Speaking style</Label>
          <Select value={value.style} disabled={disabled} onValueChange={(v) => set({ style: v as AiAgentSettings["style"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_STYLES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{style?.hint}</p>
        </div>
        )}

        {!script && (
        <div className="flex flex-col gap-2">
          <Label>Thinking</Label>
          <Select value={value.model} disabled={disabled} onValueChange={(v) => set({ model: v as AiAgentSettings["model"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{model?.hint}</p>
        </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-sample-phone">Hear it on your phone</Label>
          <div className="flex gap-2">
            <Input
              id="ai-sample-phone"
              placeholder="Your mobile number"
              inputMode="tel"
              value={phone}
              disabled={disabled}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button type="button" variant="outline" disabled={disabled || calling || !phone.trim()} onClick={hearIt}>
              {calling ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4" />}
              Call me
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">A short call to your own number with these settings. Up to 5 a day.</p>
        </div>
      </div>

      {showVoicemail && (
        <div className="flex flex-col gap-2">
          <Label>If it reaches a voicemail</Label>
          <Select value={value.voicemail} disabled={disabled} onValueChange={(v) => set({ voicemail: v as AiAgentSettings["voicemail"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_VOICEMAIL.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.voicemail === "message" && (
            <>
              <Textarea
                rows={3}
                maxLength={MAX_VOICEMAIL_MESSAGE}
                disabled={disabled}
                placeholder="Hi {{first_name}}, this is Sam from Acme. Sorry we missed you. Call us back on…"
                value={value.voicemailMessage}
                onChange={(e) => set({ voicemailMessage: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Left after the beep. Use {"{{first_name}}"} and {"{{company}}"}. Waiting for the beep adds a few seconds before a real person is connected.
              </p>
            </>
          )}
        </div>
      )}

      {script && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Offer "press 1" to speak with someone</span>
              <span className="text-xs text-muted-foreground">After the script, the person can press 1 to be connected to the number below. Everyone else hears the script and the call ends.</span>
            </div>
            <Switch checked={value.pressToConnect} disabled={disabled} onCheckedChange={(on) => set({ pressToConnect: on })} />
          </div>
          {value.pressToConnect && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-press-number">Connect them to</Label>
              <Input id="ai-press-number" placeholder="+14155550134" disabled={disabled} value={value.transferNumber} onChange={(e) => set({ transferNumber: e.target.value })} />
              <p className="text-xs text-muted-foreground">Your own phone number, with the country code. If it is empty, the offer is skipped.</p>
            </div>
          )}
        </div>
      )}

      {!script && (
      <div className="flex flex-col gap-3">
        <Label>What it can do during a call</Label>
        {ACTIONS.map((a) => (
          <div key={a.key} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.hint}</span>
            </div>
            <Switch
              checked={value.actions[a.key]}
              disabled={disabled}
              onCheckedChange={(on) => set({ actions: { ...value.actions, [a.key]: on } })}
            />
          </div>
        ))}
        {showTransfer && value.actions.transfer && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-transfer">Transfer number</Label>
            <Input
              id="ai-transfer"
              placeholder="+14155550134"
              disabled={disabled}
              value={value.transferNumber}
              onChange={(e) => set({ transferNumber: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Where a call is connected when someone asks for a human. Leave empty to turn handover off.</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
