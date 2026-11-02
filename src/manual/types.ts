// The Kchel Dialer manual: step-by-step guides from first sign-in to expert settings.
//
// This is the single source for the /manual pages, the welcome pop-up and the help
// assistant, so a screen is described once. Plain data with no server imports, so
// both the browser and the server can read it.

export type Level = "beginner" | "intermediate" | "expert";

export interface Step {
  /** One instruction, written against the real button and menu names. `**bold**` marks what to click. */
  text: string;
  /** A picture id from shots.generated.json (a file in public/manual-img). */
  shot?: string | undefined;
  /** An extra line under the step: what to expect, or what to do if it looks different. */
  note?: string | undefined;
}

export interface Section {
  heading: string;
  /** A short paragraph above the list. */
  text?: string | undefined;
  steps?: Step[] | undefined;
  bullets?: string[] | undefined;
  /** Text to copy and send somewhere, such as a message to a carrier. */
  copy?: string | undefined;
  shot?: string | undefined;
}

export interface ManualArticle {
  slug: string;
  title: string;
  level: Level;
  /** One or two sentences: what this guide gets you. */
  summary: string;
  /** About how long it takes, e.g. "5 minutes". */
  time: string;
  /** Words a person might use that the guide itself does not. They steer search and the help assistant. */
  keywords: string[];
  /** The main procedure. Shown in the chat, so it must stand on its own. */
  steps: Step[];
  /** Extra sections for the full page: background, provider notes, what-ifs. */
  more?: Section[] | undefined;
  tips?: string[] | undefined;
  /** Slugs of the guides to read next. */
  related?: string[] | undefined;
  /** Whether the guide only applies to the Windows Dialer app. */
  desktop?: boolean | undefined;
}

export interface Shot {
  alt: string;
  w: number;
  h: number;
  bytes: number;
}

export const LEVELS: { id: Level; label: string; blurb: string }[] = [
  { id: "beginner", label: "Beginner", blurb: "Set up your workspace and make your first call." },
  { id: "intermediate", label: "Intermediate", blurb: "Run your phone system, campaigns and team day to day." },
  { id: "expert", label: "Expert", blurb: "Smart calling, scale, compliance and troubleshooting." },
];
