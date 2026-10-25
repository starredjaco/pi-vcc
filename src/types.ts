import type { Message } from "@earendil-works/pi-ai";

export type CompactionReason = "manual" | "threshold" | "overflow";

export interface FileOps {
  readFiles?: string[];
  modifiedFiles?: string[];
  createdFiles?: string[];
}

export type NormalizedBlock =
  // `injected`: the user did not write the text (an extension custom_message, or
  // a user-run `!cmd` and its output). It renders in the brief but is not read
  // into [Early Session Requests] or [User Messages].
  | { kind: "user"; text: string; sourceIndex?: number; injected?: boolean }
  | { kind: "assistant"; text: string; sourceIndex?: number }
  | { kind: "tool_call"; name: string; args: Record<string, unknown>; sourceIndex?: number }
  | { kind: "tool_result"; name: string; text: string; sourceIndex?: number }
  | { kind: "bash"; command: string; output: string; exitCode: number | undefined; sourceIndex?: number };
