// Client wrappers for the platform owner's phone app (/admin/app). It keeps its own sign-in,
// separate from the website's, so every call takes the token it is given.
import { approveClaimFn, findAccountsFn, grantPlanFn, listClaimsFn, listPaymentFeedFn, rejectClaimFn } from "@/backend/payment-claims.server";
import { getPushConfigFn, removePushSubscriptionFn, savePushSubscriptionFn } from "@/backend/push.server";
import { requestLoginCodeFn, verifyLoginCodeFn } from "@/backend/auth.server";

export type { ClaimView } from "@/backend/payment-claims.server";

export const ownerApi = {
  sendCode: (email: string) => requestLoginCodeFn({ data: { email, purpose: "admin_login" } }),
  verifyCode: (email: string, code: string) => verifyLoginCodeFn({ data: { email, code, purpose: "admin_login", remember: true } }),
  claims: (token: string) => listClaimsFn({ data: { token } }),
  feed: (token: string) => listPaymentFeedFn({ data: { token } }),
  find: (token: string, query: string) => findAccountsFn({ data: { token, query } }),
  approve: (token: string, claimId: string, months?: number, amountUsd?: number) =>
    approveClaimFn({
      data: {
        token,
        claimId,
        ...(months ? { months } : {}),
        ...(amountUsd ? { amountUsd } : {}),
        origin: window.location.origin,
      },
    }),
  reject: (token: string, claimId: string, reason: string) => rejectClaimFn({ data: { token, claimId, reason } }),
  grant: (token: string, tenantId: string, plan: string, months: number, method: string, amountUsd: number, reference?: string) =>
    grantPlanFn({
      data: {
        token,
        tenantId,
        plan,
        months,
        notify: true,
        origin: window.location.origin,
        payment: { method, amountUsd, ...(reference ? { reference } : {}) },
      },
    }),
  pushKey: (token: string) => getPushConfigFn({ data: { token } }),
  savePush: (token: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, label?: string) =>
    savePushSubscriptionFn({ data: { token, subscription, ...(label ? { label } : {}) } }),
  removePush: (token: string, endpoint: string) => removePushSubscriptionFn({ data: { token, endpoint } }),
};
