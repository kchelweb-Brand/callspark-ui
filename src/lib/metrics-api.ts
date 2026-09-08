import {
  getAnalyticsFn,
  getLiveFloorFn,
  getOverviewFn,
  listRecordingsFn,
} from "@/backend/metrics.server";
import { getSessionToken } from "./auth-api";

function requireToken(): string {
  const token = getSessionToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

export function getOverview() {
  return getOverviewFn({ data: { token: requireToken() } });
}

export function getAnalytics(range: string) {
  return getAnalyticsFn({ data: { token: requireToken(), range } });
}

export function getLiveFloor() {
  return getLiveFloorFn({ data: { token: requireToken() } });
}

export function listRecordings(search?: string) {
  return listRecordingsFn({ data: { token: requireToken(), ...(search ? { search } : {}) } });
}

/** mm:ss for call durations. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/** Human talk time: "3h 41m" / "22m". */
export function formatTalk(seconds: number): string {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
