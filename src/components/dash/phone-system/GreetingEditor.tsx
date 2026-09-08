import { useRef, useState } from "react";
import { FileAudio, Loader2, Mic, Play, Square, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTtsPreview } from "@/hooks/use-tts-preview";
import { deleteGreeting, uploadGreeting } from "@/lib/media-api";
import type { GreetingFile, GreetingMode } from "@/lib/phone-system-data";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Shared text-to-speech-or-upload greeting editor used by IVR menus and voicemail. */
export function GreetingEditor({
  mode,
  text,
  file,
  onModeChange,
  onTextChange,
  onFileChange,
}: {
  mode: GreetingMode;
  text: string;
  file: GreetingFile | null | undefined;
  onModeChange: (mode: GreetingMode) => void;
  onTextChange: (text: string) => void;
  onFileChange: (file: GreetingFile | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tts = useTtsPreview();
  const [uploading, setUploading] = useState(false);
  const [playingFile, setPlayingFile] = useState(false);

  async function handleFile(picked: File) {
    setUploading(true);
    try {
      const uploaded = await uploadGreeting(picked);
      // Remove the previous object so replacing a greeting doesn't leak storage.
      if (file?.key) void deleteGreeting(file.key).catch(() => {});
      onFileChange({ name: uploaded.fileName, url: uploaded.url, key: uploaded.key });
      toast.success("Greeting uploaded", {
        description: `${uploaded.fileName} · ${formatBytes(uploaded.bytes)}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function togglePlayFile() {
    if (!file) return;
    if (playingFile) {
      audioRef.current?.pause();
      setPlayingFile(false);
      return;
    }
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = file.url;
    audio.onended = () => setPlayingFile(false);
    audio.onerror = () => {
      setPlayingFile(false);
      toast.error("Could not play that file.");
    };
    void audio.play().then(() => setPlayingFile(true));
  }

  async function removeFile() {
    if (!file) return;
    const key = file.key;
    onFileChange(null);
    audioRef.current?.pause();
    setPlayingFile(false);
    try {
      await deleteGreeting(key);
      toast.success("Greeting removed");
    } catch {
      // The reference is already gone from the config; a stray object is
      // harmless and not worth alarming the user about.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "tts" ? "default" : "outline"}
          onClick={() => onModeChange("tts")}
        >
          <Mic className="size-3.5" /> Text-to-speech
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "upload" ? "default" : "outline"}
          onClick={() => onModeChange("upload")}
        >
          <FileAudio className="size-3.5" /> Uploaded audio
        </Button>
      </div>

      {mode === "tts" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="greeting-text">Script</Label>
          <Textarea
            id="greeting-text"
            rows={3}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Thanks for calling…"
          />

          {tts.supported ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!text.trim()}
                onClick={() => (tts.speaking ? tts.stop() : tts.speak(text))}
              >
                {tts.speaking ? (
                  <>
                    <Square className="size-3.5" /> Stop
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" /> Preview
                  </>
                )}
              </Button>

              {tts.voices.length > 0 && (
                <Select value={tts.voiceUri} onValueChange={tts.setVoiceUri}>
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue placeholder="Voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {tts.voices.map((v) => (
                      <SelectItem key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <span className="text-xs text-muted-foreground">
                Preview uses your device's voice — callers hear your carrier's.
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Preview isn't available in this browser.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void handleFile(picked);
              e.target.value = "";
            }}
          />

          <div
            className={cn(
              "flex items-center gap-3 rounded-lg border border-dashed p-3",
              file ? "border-success/35 bg-success/8" : "border-border bg-muted/40",
            )}
          >
            {file && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-8 shrink-0 rounded-full"
                aria-label={playingFile ? "Pause" : "Play greeting"}
                onClick={togglePlayFile}
              >
                {playingFile ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
              </Button>
            )}

            <span className="min-w-0 flex-1 truncate text-sm">
              {file ? file.name : "No audio file uploaded yet"}
            </span>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {uploading ? "Uploading…" : file ? "Replace" : "Upload"}
            </Button>

            {file && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Remove greeting"
                onClick={() => void removeFile()}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            MP3, WAV, OGG or WebM — up to 5MB.
          </p>
        </div>
      )}
    </div>
  );
}
