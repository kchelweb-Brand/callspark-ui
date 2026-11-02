// Pieces of the manual shared by the /manual pages: a step list with pictures, and extra sections.
import { Check, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";

import { getShot, inlinePieces, type Section, type Step } from "@/manual";

export function Inline({ text }: { text: string }) {
  return (
    <>
      {inlinePieces(text).map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-bold text-ink">
            {p.text}
          </strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** A picture that opens full size when pressed. */
export function ShotImage({ id, className = "", compact = false }: { id: string; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const shot = getShot(id);
  useEffect(() => {
    if (!open) return;
    // Captured first and stopped, so closing the picture does not also close a chat window it sits in.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!shot) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group block overflow-hidden rounded-lg border border-rule bg-white text-left shadow-sm transition hover:border-leaf ${className}`}
        aria-label={`Enlarge picture: ${shot.alt}`}
      >
        <img src={shot.src} alt={shot.alt} width={shot.w} height={shot.h} loading="lazy" className="h-auto w-full" />
        <span className="block border-t border-rule bg-mist px-3 py-1.5 text-[12px] text-slate">
          {compact ? "Press to enlarge" : `${shot.alt}. Press to enlarge.`}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={shot.alt}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            aria-label="Close picture"
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white text-ink"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
          <img src={shot.src} alt={shot.alt} className="max-h-full max-w-full rounded-lg bg-white object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

export function StepList({ steps, startAt = 1 }: { steps: Step[]; startAt?: number }) {
  return (
    <ol className="space-y-7">
      {steps.map((s, i) => (
        <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-navy text-[16px] font-extrabold text-white">{startAt + i}</span>
          <div className="min-w-0">
            <p className="pt-1.5 text-[17px] leading-relaxed text-slate">
              <Inline text={s.text} />
            </p>
            {s.note && <p className="mt-2 rounded-lg border border-rule bg-mist px-3 py-2 text-[14.5px] leading-relaxed text-slate">{s.note}</p>}
            {s.shot && <ShotImage id={s.shot} className="mt-3 max-w-2xl" />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CopyBox({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-rule bg-mist p-4">
      <p className="text-[15.5px] leading-relaxed text-ink">{text}</p>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          });
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-3 py-1.5 text-[13px] font-semibold hover:border-leaf"
      >
        {done ? <Check className="size-4 text-leaf" /> : <Copy className="size-4" />} {done ? "Copied" : "Copy this message"}
      </button>
    </div>
  );
}

export function MoreSection({ section }: { section: Section }) {
  return (
    <section className="rounded-xl border border-rule p-6">
      <h2 className="text-[1.3rem] font-extrabold tracking-tight">{section.heading}</h2>
      {section.text && (
        <p className="mt-2 text-[17px] leading-relaxed text-slate">
          <Inline text={section.text} />
        </p>
      )}
      {section.copy && <CopyBox text={section.copy} />}
      {section.bullets && (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[16.5px] leading-relaxed text-slate">
          {section.bullets.map((b, i) => (
            <li key={i}>
              <Inline text={b} />
            </li>
          ))}
        </ul>
      )}
      {section.steps && (
        <div className="mt-4">
          <StepList steps={section.steps} />
        </div>
      )}
      {section.shot && <ShotImage id={section.shot} className="mt-4 max-w-2xl" />}
    </section>
  );
}
