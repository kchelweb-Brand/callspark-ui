import { useCallback, useEffect, useState } from "react";

/**
 * Speaks greeting text aloud using the browser's built-in speech synthesis.
 *
 * This is a *preview*, not the real thing: callers will hear the carrier's
 * voice (Telnyx/Polly/Azure), not the visitor's local OS voice. It's for
 * checking wording, pacing and pronunciation while writing — free, offline,
 * and with no service to sign up for.
 */
export function useTtsPreview() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    // Voices populate asynchronously in most browsers — reading them once on
    // mount usually returns an empty list, so listen for the change event too.
    const load = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length === 0) return;
      setVoices(available);
      setVoiceUri((current) => {
        if (current) return current;
        // Prefer an English voice by default; fall back to whatever exists.
        const preferred =
          available.find((v) => v.default && v.lang.startsWith("en")) ??
          available.find((v) => v.lang.startsWith("en")) ??
          available[0];
        return preferred?.voiceURI ?? "";
      });
    };

    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      // Don't leave speech running after the editor closes.
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      // Chrome queues utterances; cancel first so repeated clicks restart
      // rather than stacking up.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      const chosen = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceUri);
      if (chosen) utterance.voice = chosen;

      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [voiceUri],
  );

  return { supported, speaking, voices, voiceUri, setVoiceUri, speak, stop };
}
