import type { FileOps, NormalizedBlock } from "../types";
import type { SectionData } from "../sections";
import { extractFiles } from "../extract/files";
import { EARLY_REQUESTS_KEPT, extractUserMessages, keepNewestUserMessages } from "../extract/user-messages";
import { extractCommits, formatCommits } from "../extract/commits";
import { extractTrackedCommands, formatTrackedCommands } from "../extract/tracked-commands";
import { buildBriefSections, stringifyBrief } from "./brief";
import { FILES_PER_CATEGORY, capItems } from "./format";

export interface BuildSectionsInput {
  blocks: NormalizedBlock[];
  briefBlocks?: NormalizedBlock[];
  /** Hook-provided file activity; authoritative for files touched before this compaction. */
  fileOps?: FileOps;
  /** Command names to record in a [Tracked Commands] section (see
   * PiVccSettings.trackCommands). Empty/omitted = section stays empty. */
  trackCommands?: readonly string[];
  /** The previous summary already holds the early requests, so this
   * compaction's first messages are ordinary user messages. */
  hasEarlyRequests?: boolean;
}

const formatFileActivity = (blocks: NormalizedBlock[], fileOps?: FileOps): string[] => {
  const act = extractFiles(blocks, fileOps);
  // Dedup: if already Modified, drop from Created (file existed before)
  for (const p of act.modified) act.created.delete(p);
  const lines: string[] = [];
  const cap = (set: Set<string>) => capItems([...set], FILES_PER_CATEGORY, ", ");
  if (act.modified.size > 0) lines.push(`Modified: ${cap(act.modified)}`);
  if (act.created.size > 0) lines.push(`Created: ${cap(act.created)}`);
  if (act.read.size > 0) lines.push(`Read: ${cap(act.read)}`);
  return lines;
};

export const buildSections = (input: BuildSectionsInput): SectionData => {
  const { blocks } = input;
  const briefSections = buildBriefSections(input.briefBlocks ?? blocks);
  // The early requests are the session's first user messages, picked by
  // position; they are not repeated in [User Messages].
  const messages = extractUserMessages(blocks);
  const early = input.hasEarlyRequests ? [] : messages.slice(0, EARLY_REQUESTS_KEPT);
  return {
    earlyRequests: early,
    filesAndChanges: formatFileActivity(blocks, input.fileOps),
    commits: formatCommits(extractCommits(blocks)),
    userMessages: keepNewestUserMessages(messages.slice(early.length)),
    trackedCommands: formatTrackedCommands(extractTrackedCommands(blocks, input.trackCommands ?? [])),
    briefTranscript: stringifyBrief(briefSections),
  };
};
