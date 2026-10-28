// Shapes shared between the help assistant's server code and its browser wrapper.
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
