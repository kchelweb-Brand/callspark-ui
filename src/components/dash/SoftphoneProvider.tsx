import { createContext, useContext, type ReactNode } from "react";

import { useSoftphone } from "@/hooks/use-softphone";

type SoftphoneApi = ReturnType<typeof useSoftphone>;

const SoftphoneContext = createContext<SoftphoneApi | null>(null);

/**
 * Mounted once in the tenant Shell so a single registration survives
 * navigation. Without this, moving between pages would drop and re-establish
 * the carrier connection — and any in-progress call with it.
 */
export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const softphone = useSoftphone();
  return <SoftphoneContext.Provider value={softphone}>{children}</SoftphoneContext.Provider>;
}

/** Throws outside the provider — that's a wiring mistake worth surfacing loudly. */
export function useSoftphoneContext(): SoftphoneApi {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) throw new Error("useSoftphoneContext must be used inside <SoftphoneProvider>");
  return ctx;
}

/**
 * Safe variant for components that render in both tenant and admin scope —
 * returns null instead of throwing when no softphone is mounted.
 */
export function useOptionalSoftphone(): SoftphoneApi | null {
  return useContext(SoftphoneContext);
}
