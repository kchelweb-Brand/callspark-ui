import { FileAudio, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteGreeting, uploadGreeting } from "@/lib/media-api";
import {
  MAX_CALLS_AT_ONCE,
  RECORDING_VOICEMAIL,
  recordingExtension,
  type RecordingSettings,
  type RecordingVoicemail,
} from "@/backend/recording-options";

const MAX_MB = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Everything about a voice broadcast except its name and list: the recording itself, what happens
 * on voicemail, the optional "press 1" and "press 2" keys, and how many people are rung at once.
 *
 * `savedKey` is the recording already stored on the campaign. A file uploaded in this form but not
 * yet saved is deleted again if it is replaced or removed, so abandoned uploads don't pile up.
 */
export function RecordingSettingsForm({
  value,
  onChange,
  savedKey = null,
}: {
  value: RecordingSettings;
  onChange: (next: RecordingSettings) => void;
  savedKey?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function patch(change: Partial<RecordingSettings>) {
    onChange({ ...value, ...change });
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
      const uploaded = await uploadGreeting(picked);
      dropUnsaved();
      patch({ file: { key: uploaded.key, url: uploaded.url, fileName: uploaded.fileName, bytes: uploaded.bytes } });
      toast.success("Recording uploaded", { description: `${uploaded.fileName} · ${formatBytes(uploaded.bytes)}` });
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
          Start the recording by saying who you are and that it is a recorded message. If you turn on a key below, say
          what it does in the recording itself, for example “Press 1 to speak with us.”
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

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">While the recording plays, the person can press a key</p>
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
      </div>

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
