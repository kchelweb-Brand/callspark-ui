// The one switch for AI on phone calls. While it is false, no call is answered or placed by the AI:
// AI campaigns do not dial, "Call me" sample calls are refused, and the AI receptionist stays off
// (inbound calls follow the normal IVR, voicemail and text-back). Script campaigns, which read a
// written script, and the help chat are not affected. Flip to true and deploy to bring the AI back.
export const AI_CALLING_ENABLED = false;

export const AI_OFF_MESSAGE = "AI calling is switched off. Use a script campaign instead.";
