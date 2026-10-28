import { CircleCheck, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimPayment, type listPlans } from "@/lib/billing-api";
import { prepareReceipt } from "@/lib/receipt-file";

type Option = Awaited<ReturnType<typeof listPlans>>["checkout"][number];

interface CardRow {
  id: number;
  file: File | null;
  amount: string;
}

const MAX_CARDS = 6;
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
let nextId = 1;
const blankCard = (): CardRow => ({ id: nextId++, file: null, amount: "" });

/** A small picture of the file chosen, so the customer can see the right card was picked. */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt="" className="size-16 shrink-0 rounded-md border border-border object-cover" /> : null;
}

/**
 * "I've paid": what the customer sends so the owner can verify the payment. A gift card is
 * sent as one or more cards, each with its own picture and amount, because a customer who
 * cannot buy a single $300 card may send three of $100. Whatever the method, the customer
 * is told straight afterwards that an email is on its way and that nothing is switched on
 * until a person has verified the payment.
 */
export function ClaimDialog({ claim, onClose }: { claim: Option | null; onClose: () => void }) {
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [cards, setCards] = useState<CardRow[]>([blankCard()]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ declared: number | null } | null>(null);

  useEffect(() => {
    setReference("");
    setReceipt(null);
    setCards([blankCard()]);
    setDone(null);
  }, [claim]);

  const gift = claim?.method === "giftcard";
  const total = cards.reduce((n, c) => n + (Number(c.amount) > 0 ? Number(c.amount) : 0), 0);
  const price = claim?.amountUsd ?? 0;
  const ready = gift ? cards.length > 0 && cards.every((c) => c.file && Number(c.amount) > 0) : reference.trim().length >= 4 || !!receipt;

  const setCard = (id: number, patch: Partial<CardRow>) => setCards((all) => all.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function send() {
    if (!claim) return;
    setBusy(true);
    try {
      const prepared = gift
        ? await Promise.all(cards.map(async (c) => ({ ...(await prepareReceipt(c.file as File)), amountUsd: Number(c.amount) })))
        : undefined;
      const r = await claimPayment({
        planId: claim.planId,
        seats: claim.seats,
        interval: claim.interval,
        method: claim.method,
        reference,
        amountUsd: claim.amountUsd,
        ...(receipt ? { receipt: await prepareReceipt(receipt) } : {}),
        ...(prepared ? { cards: prepared } : {}),
      });
      setDone({ declared: r.declaredUsd });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!claim} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CircleCheck className="size-6" />
            </span>
            <DialogTitle>Sent for verification</DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Please check your email.</strong> We've sent you a message confirming we
              received your {gift ? "gift cards" : "payment details"}
              {done.declared !== null ? ` (${money(done.declared)} in total)` : ""}. Check your spam folder if you don't see it.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your plan is switched on <strong className="text-foreground">only after our team has verified the payment</strong>.
              When that's done we'll email you again with your receipt. Your free trial keeps running meanwhile.
            </p>
            <DialogFooter className="w-full">
              <Button className="w-full" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{gift ? "Send your gift cards" : "Tell us you've paid"}</DialogTitle>
              <DialogDescription>
                {gift
                  ? `Add a clear photo of each Apple gift card (USA only) and the amount on it. The price is ${money(price)}. If you can't get one big card, add several, for example 3 cards of $100.`
                  : "We'll verify the payment and then activate your plan. Add something we can find: a transaction ID, a receipt number, or a screenshot of the receipt."}
              </DialogDescription>
            </DialogHeader>

            {gift ? (
              <div className="flex flex-col gap-3">
                {cards.map((c, i) => (
                  <div key={c.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Card {i + 1}</p>
                      {cards.length > 1 && (
                        <button type="button" aria-label={`Remove card ${i + 1}`} className="text-muted-foreground hover:text-foreground" onClick={() => setCards((all) => all.filter((x) => x.id !== c.id))}>
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {c.file && <Thumb file={c.file} />}
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-sm hover:bg-muted/50">
                        <ImagePlus className="size-4 shrink-0" />
                        <span className="truncate">{c.file ? c.file.name : "Choose the card photo"}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          aria-label={`Photo of card ${i + 1}`}
                          onChange={(e) => setCard(c.id, { file: e.target.files?.[0] ?? null })}
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Label htmlFor={`card-amount-${c.id}`} className="shrink-0 text-sm">
                        Amount on this card
                      </Label>
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <Input id={`card-amount-${c.id}`} inputMode="decimal" className="pl-7" placeholder="100" value={c.amount} onChange={(e) => setCard(c.id, { amount: e.target.value.replace(/[^0-9.]/g, "") })} />
                      </div>
                    </div>
                  </div>
                ))}
                {cards.length < MAX_CARDS && (
                  <Button type="button" variant="outline" onClick={() => setCards((all) => [...all, blankCard()])}>
                    <Plus className="size-4" /> Add another card
                  </Button>
                )}
                <div className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${total + 0.005 >= price ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                  Total {money(total)} of {money(price)}
                  {total + 0.005 < price ? ` · add ${money(price - total)} more, or we'll contact you for the rest` : " · that covers it"}
                </div>
                <p className="text-xs text-muted-foreground">Apple gift cards from the USA only. Only send cards you own and that have not been used.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="claim-ref">Reference (transaction ID or receipt number)</Label>
                <Input id="claim-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                <Label htmlFor="claim-receipt" className="mt-2">
                  Receipt (screenshot or PDF), helps us verify faster
                </Label>
                <input
                  id="claim-receipt"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                  onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">A reference or a receipt is enough; both is best. Cover any card number first.</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={busy || !ready} onClick={() => void send()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {gift ? "Send cards for verification" : "Send"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
