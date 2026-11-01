import { FileAudio, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteGreeting, uploadGreeting } from "@/lib/media-api";
import {
  MAX_CALLS_AT_ONCE,
  MAX_FOLLOW_UP_CHARS,
  MAX_RETRIES,
  RECORDING_VOICEMAIL,
  RETRY_DELAYS,
  recordingExtension,
  type CallingWindow,
  type RecordingSettings,
  type RecordingVoicemail,
} from "@/backend/recording-options";

const MAX_MB = 5;

/** Zones offered for "one time zone for everybody". The one already chosen is always kept in the list. */
const ZONE_CHOICES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Halifax",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hourLabel(h: number): string {
  const hour = h % 24;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** How long a chosen audio file plays, read in the browser. Only used for the cost estimate, so a failure just means no estimate. */
function readDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds?: number) => {
      URL.revokeObjectURL(url);
      resolve(seconds && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : undefined);
    };
    const timer = setTimeout(() => done(), 4000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done();
    };
    audio.src = url;
  });
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Everything about a voice broadcast except its name and list: the recording itself, what happens
 * on voicemail, the keys, when calls may be placed, retries, the number called from, and the follow-up text.
 *
 * `savedKey` is the recording already stored on the campaign. A file uploaded in this form but not
 * yet saved is deleted again if it is replaced or removed, so abandoned uploads don't pile up.
 * `numbers` are the workspace's own numbers, and `defaultZone` the zone to suggest.
 */
export function RecordingSettingsForm({
  value,
  onChange,
  savedKey = null,
  numbers = [],
  defaultZone,
}: {
  value: RecordingSettings;
  onChange: (next: RecordingSettings) => void;
  savedKey?: string | null;
  numbers?: { number: string; label: string }[];
  defaultZone?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function patch(change: Partial<RecordingSettings>) {
    onChange({ ...value, ...change });
  }
  function patchWindow(change: Partial<CallingWindow>) {
    onChange({ ...value, window: { ...value.window, ...change } });
  }

  function dropUnsaved() {
    if (value.file && value.file.key !== savedKey) void deleteGreeting(value.file.key).catch(() => {});
  }

  async function handleFile(picked: File) {
    const ext = picked.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "mp3" && ext !== "wav") {
      toast.error("Use an MP3 or WAV recording.", { description: "Other formats don't play reliably on phone calls." });
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      toast.error(`That file is too large. The most is ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const [uploaded, seconds] = await Promise.all([uploadGreeting(picked), readDuration(picked)]);
      dropUnsaved();
      patch({
        file: {
          key: uploaded.key,
          url: uploaded.url,
          fileName: uploaded.fileName,
          bytes: uploaded.bytes,
          ...(seconds ? { seconds } : {}),
        },
      });
      toast.success("Recording uploaded", {
        description: `${uploaded.fileName} · ${formatBytes(uploaded.bytes)}${seconds ? ` · ${seconds}s` : ""}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeFile() {
    dropUnsaved();
    patch({ file: null });
  }

  const file = value.file;
  const w = value.window;
  const zones = ZONE_CHOICES.includes(w.zone) ? ZONE_CHOICES : [w.zone, ...ZONE_CHOICES];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Recording</Label>
        <input
          ref={fileRef}
          type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void handleFile(picked);
          }}
        />
        {file ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <FileAudio className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {recordingExtension(file.key).toUpperCase()} · {formatBytes(file.bytes)}
                  {file.seconds ? ` · ${file.seconds}s` : ""}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Replace
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={removeFile} aria-label="Remove recording">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <audio controls preload="none" src={file.url} className="w-full" />
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            <span className="font-medium text-foreground">{uploading ? "Uploading…" : "Upload your recording"}</span>
            <span className="text-xs">MP3 or WAV, up to {MAX_MB} MB. Everyone who answers hears this.</span>
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          Start the recording by saying who you are, that it is a recorded message, and a number people can call you back on.
          If you turn on a key below, say what it does in the recording itself, for example “Press 1 to speak with us.”
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>If voicemail answers</Label>
        <Select value={value.voicemail} onValueChange={(v) => patch({ voicemail: v as RecordingVoicemail })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RECORDING_VOICEMAIL.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Checking for voicemail adds a short pause before a person hears the recording.
        </p>
      </div>

      <Section title="While the recording plays, the person can press a key">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="rec-connect" className="text-sm font-normal">
            Press 1 to be connected to a person
          </Label>
          <Switch id="rec-connect" checked={value.connectEnabled} onCheckedChange={(on) => patch({ connectEnabled: on })} />
        </div>
        {value.connectEnabled && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="rec-transfer" className="text-xs text-muted-foreground">
              Connect them to this number
            </Label>
            <Input
              id="rec-transfer"
              placeholder="+14155550134"
              value={value.transferNumber}
              onChange={(e) => patch({ transferNumber: e.target.value })}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="rec-optout" className="text-sm font-normal">
            Press 2 to never be called again
          </Label>
          <Switch id="rec-optout" checked={value.optOutEnabled} onCheckedChange={(on) => patch({ optOutEnabled: on })} />
        </div>
        {!value.optOutEnabled && (
          <p className="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
            Recorded calls to people in the US need an easy way to opt out. Leaving this off is your responsibility.
          </p>
        )}
      </Section>

      <Section
        title="When calls are placed"
        hint="Nobody is called outside these hours. Calls already ringing finish; the rest wait and carry on when the hours open."
      >
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="win-on" className="text-sm font-normal">
            Only call during set hours
          </Label>
          <Switch id="win-on" checked={w.enabled} onCheckedChange={(on) => patchWindow({ enabled: on })} />
        </div>
        {w.enabled ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Select value={String(w.startHour)} onValueChange={(v) => patchWindow({ startHour: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => (
                      <SelectItem key={h} value={String(h)} disabled={h >= w.endHour}>
                        {hourLabel(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Until</Label>
                <Select value={String(w.endHour)} onValueChange={(v) => patchWindow({ endHour: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => (
                      <SelectItem key={h} value={String(h)} disabled={h <= w.startHour}>
                        {hourLabel(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, day) => {
                const on = w.days.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? w.days.filter((d) => d !== day) : [...w.days, day].sort();
                      if (next.length > 0) patchWindow({ days: next });
                    }}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Whose clock</Label>
              <Select value={w.mode} onValueChange={(v) => patchWindow({ mode: v as CallingWindow["mode"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Each person's own local time (recommended)</SelectItem>
                  <SelectItem value="single">One time zone for everybody</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {w.mode === "single" ? "Time zone" : "Time zone for numbers we can't place"}
              </Label>
              <Select value={w.zone} onValueChange={(v) => patchWindow({ zone: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z.replace(/_/g, " ")}
                      {z === defaultZone ? " (your workspace)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {w.mode === "contact" ? (
                <p className="text-xs text-muted-foreground">
                  Worked out from the phone number. Someone whose number covers two zones is only called when both are inside the hours.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
            With this off, calls go out at any hour. The US allows recorded sales calls only between 8am and 9pm the person's time.
          </p>
        )}
      </Section>

      <Section title="Try again" hint="People who don't pick up can be tried again automatically, so you don't have to queue them by hand.">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Extra tries</Label>
            <Select
              value={String(value.retry.max)}
              onValueChange={(v) => patch({ retry: { ...value.retry, max: Number(v) } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_RETRIES + 1 }, (_, i) => i).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 0 ? "None" : n === 1 ? "1 more try" : `${n} more tries`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Wait</Label>
            <Select
              value={String(value.retry.delayMinutes)}
              disabled={value.retry.max === 0}
              onValueChange={(v) => patch({ retry: { ...value.retry, delayMinutes: Number(v) } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETRY_DELAYS.map((d) => (
                  <SelectItem key={d.minutes} value={String(d.minutes)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {value.retry.max > 0 && (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="retry-vm" className="text-sm font-normal">
              Also try again when voicemail answers
            </Label>
            <Switch
              id="retry-vm"
              checked={value.retry.includeVoicemail}
              onCheckedChange={(on) => patch({ retry: { ...value.retry, includeVoicemail: on } })}
            />
          </div>
        )}
        {value.retry.max > 0 && (
          <p className="text-xs text-muted-foreground">
            Retries use more call minutes. Anyone who answers, presses a key, or opts out is never tried again.
          </p>
        )}
      </Section>

      <Section title="Call from" hint="Which of your numbers people see. Automatic spreads calls across your numbers and rests any that look risky.">
        <Select value={value.callerId || "auto"} onValueChange={(v) => patch({ callerId: v === "auto" ? "" : v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic</SelectItem>
            {numbers.map((n) => (
              <SelectItem key={n.number} value={n.number}>
                {n.number}
                {n.label ? ` · ${n.label}` : ""}
              </SelectItem>
            ))}
            {value.callerId && !numbers.some((n) => n.number === value.callerId) ? (
              <SelectItem value={value.callerId}>{value.callerId}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {value.callerId ? (
          <p className="text-xs text-muted-foreground">
            Every call uses this number, so it is not rested or switched if it starts to look like spam. Keep an eye on its health under Automations.
          </p>
        ) : null}
      </Section>

      <Section title="Text follow-up" hint="Send a text to the people who respond. Only to people who weren't marked do-not-text.">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="fu-on" className="text-sm font-normal">
            Send a text after the call
          </Label>
          <Switch
            id="fu-on"
            checked={value.followUp.enabled}
            onCheckedChange={(on) => patch({ followUp: { ...value.followUp, enabled: on } })}
          />
        </div>
        {value.followUp.enabled && (
          <>
            <Select
              value={value.followUp.when}
              onValueChange={(v) => patch({ followUp: { ...value.followUp, when: v as "pressed_1" | "heard" } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pressed_1">Only people who pressed 1</SelectItem>
                <SelectItem value="heard">Everyone who listened to the recording</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              rows={3}
              maxLength={MAX_FOLLOW_UP_CHARS}
              placeholder="Hi {first_name}, thanks for listening. Here are the details: …"
              value={value.followUp.message}
              onChange={(e) => patch({ followUp: { ...value.followUp, message: e.target.value } })}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{first_name}"} and {"{company}"}. Up to {MAX_FOLLOW_UP_CHARS} characters. Sent from the number that called. Text
              messaging has its own consent rules, and some carriers require your numbers to be registered for it.
            </p>
          </>
        )}
      </Section>

      <div className="flex flex-col gap-2">
        <Label>People rung at the same time</Label>
        <Select value={String(value.callsAtOnce)} onValueChange={(v) => patch({ callsAtOnce: Number(v) })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: MAX_CALLS_AT_ONCE }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 1 ? "1 (one call after another)" : `${n} at once`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
