// Shapes shared between the help assistant's server code and its browser wrapper.
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GuideShot {
  id: string;
  src: string;
  alt: string;
  w: number;
  h: number;
}

/** A step-by-step guide from the manual, shown under an answer with its screenshots. */
export interface GuideCard {
  slug: string;
  title: string;
  summary: string;
  time: string;
  /** The page that holds the full guide. */
  href: string;
  steps: { text: string; note?: string; shot?: GuideShot }[];
  related: { slug: string; title: string; href: string }[];
}

/** A plan suggestion, shown when the question runs into a limit the current plan has. */
export interface UpgradeCard {
  planName: string;
  priceLine: string;
  /** Why this plan: what the person is using or asking for. */
  points: string[];
  /** What the plan gives them. */
  includes: string[];
  /** Where to act on it: Billing when signed in, Pricing otherwise. */
  href: string;
  cta: string;
}

export interface HelpReply {
  ok: true;
  reply: string;
  escalate: boolean;
  guide?: GuideCard;
  upgrade?: UpgradeCard;
}
