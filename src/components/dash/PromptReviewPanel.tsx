import { useState } from "react";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { reviewCampaignPrompt } from "@/lib/workspace-api";

/** Sits under an AI-prompt textarea — checks it for scam/spam-sounding language and offers a rewrite. */
export function PromptReviewPanel({
  prompt,
  businessName,
  onApply,
}: {
  prompt: string;
  businessName?: string;
  onApply: (rewrite: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ concerns: string[]; rewrite: string } | null>(null);

  async function check() {
    if (!prompt.trim()) {
      toast.error("Write a prompt first.");
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const res = await reviewCampaignPrompt(prompt, businessName);
      setResult({ concerns: res.concerns, rewrite: res.rewrite });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not review that prompt.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
        {checking ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Check for spam/scam language
      </Button>

      {result && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
          {result.concerns.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
                <ShieldAlert className="size-3.5" /> Things that could sound like spam or a scam
              </p>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {result.concerns.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No obvious red flags found.</p>
          )}
          {result.rewrite && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold">Suggested rewrite</p>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
                {result.rewrite}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => onApply(result.rewrite)}
              >
                Apply rewrite
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
