import type { NormalizedBlock } from "../types";

interface CommitInfo {
  hash?: string;
  message: string;
}

const COMMIT_MSG_RE = /git\s+commit[^\n]*?\s-[A-Za-z]*m\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\$?'((?:[^'\\]|\\.)*)')/;
// `-F -` / `--file=-` reads the message from stdin; the heredoc feeding it sits on the same command.
// A file path after -F cannot be read from the transcript, so it is not matched.
const STDIN_HEREDOC_COMMIT_RE =
  /git\s+commit[^\n]*?(?:\s-[A-Za-z]*F|\s--file)(?:\s+|=)-(?=\s)[^\n]*?<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))[^\n]*(?:\r?\n|\\n)/;
// Match short hash from git output: "[branch hash]" or "main hash" or 7-12 hex
const HASH_RE = /\b([0-9a-f]{7,12})\b/;

const cleanMessage = (msg: string): string =>
  msg.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();

const linesOf = (text: string): string[] => text.split(/\\n|\n/);

const firstLineOf = (text: string): string => {
  const line = linesOf(text)[0] ?? "";
  return line.trim();
};

// COMMIT_MSG_RE only yields the `$(cat <<...` opener (truncated at the inner quote for <<"DELIM"), so heredoc -m is re-read from the raw command.
const HEREDOC_COMMIT_CMD_RE =
  /^git\s+commit[^\n"'&;|]*?\s-[A-Za-z]*m\s+"\$\(cat\s+<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_]\w*))(?:\r?\n|\\n)/;

const firstHeredocBodyLine = (rest: string, delim: string): string => {
  for (const line of linesOf(rest)) {
    const trimmed = line.replace(/^\t+/, "").trim();
    if (trimmed === delim) break;
    if (trimmed) return trimmed;
  }
  return "";
};

const subjectFromHeredocCmd = (cmd: string): string | null => {
  const m = cmd.match(HEREDOC_COMMIT_CMD_RE);
  if (!m) return null;
  const delim = m[1] ?? m[2] ?? m[3] ?? "";
  return cleanMessage(firstHeredocBodyLine(cmd.slice(m.index! + m[0].length), delim));
};

const subjectFromStdinHeredoc = (cmd: string): string | null => {
  const m = cmd.match(STDIN_HEREDOC_COMMIT_RE);
  if (!m) return null;
  const delim = m[1] ?? m[2] ?? m[3] ?? "";
  return cleanMessage(firstHeredocBodyLine(cmd.slice(m.index! + m[0].length), delim));
};

/**
 * Extract git commits from bash tool calls (`git commit -m "..."`) and pair
 * with hash from the immediately following tool_result.
 */
export const extractCommits = (blocks: NormalizedBlock[]): CommitInfo[] => {
  const commits: CommitInfo[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== "tool_call" || b.name !== "bash") continue;
    const cmd = typeof b.args.command === "string" ? b.args.command : "";
    if (!/\bgit\s+commit\b/.test(cmd)) continue;
    const m = cmd.match(COMMIT_MSG_RE);
    let message: string;
    if (m) {
      // First -m is `"$(cat <<DELIM ...`: COMMIT_MSG_RE only sees `$(cat <<...`, so read the heredoc body.
      const heredoc = m[1] !== undefined && /^\$\(cat\s+<</.test(m[1])
        ? subjectFromHeredocCmd(cmd.slice(m.index!))
        : null;
      message = heredoc ?? firstLineOf(cleanMessage(m[1] ?? m[2] ?? m[3] ?? ""));
      if (heredoc === null && /^\$\(cat\s+<</.test(message)) continue;
    } else {
      message = subjectFromStdinHeredoc(cmd) ?? "";
    }
    if (!message) continue;

    let hash: string | undefined;
    // Look at next tool_result for hash
    for (let j = i + 1; j < Math.min(blocks.length, i + 3); j++) {
      const r = blocks[j];
      if (r.kind !== "tool_result") continue;
      // Common git commit output: `[branch <hash>] message` or `<branch> <hash>..<hash>`
      const bracket = r.text.match(/\[\S+\s+([0-9a-f]{7,12})\]/);
      if (bracket) { hash = bracket[1]; break; }
      const range = r.text.match(/\b([0-9a-f]{7,12})\.\.([0-9a-f]{7,12})\b/);
      if (range) { hash = range[2]; break; }
      const plain = r.text.match(HASH_RE);
      if (plain) { hash = plain[1]; break; }
    }

    // One entry per commit: the same message seen hashless (`-q` prints no hash) and hashed is one commit, keep the hashed.
    const dup = commits.find((c) => c.message === message && (!c.hash || !hash || c.hash === hash));
    if (!dup) commits.push({ hash, message });
    else if (hash && !dup.hash) dup.hash = hash;
  }

  return commits;
};

export const formatCommits = (commits: CommitInfo[], limit = 8): string[] => {
  const lines: string[] = [];
  const items = commits.slice(-limit); // keep most recent
  for (const c of items) {
    const prefix = c.hash ? `${c.hash}: ` : "";
    lines.push(`${prefix}${c.message}`);
  }
  return lines;
};
