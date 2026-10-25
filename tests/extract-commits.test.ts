import { describe, it, expect } from "bun:test";
import { extractCommits } from "../src/extract/commits";
import type { NormalizedBlock } from "../src/types";

const commitBlocks = (command: string): NormalizedBlock[] => [
  { kind: "tool_call", name: "bash", args: { command } },
  { kind: "tool_result", name: "bash", text: "[master 5416801] commit" },
];

describe("extractCommits", () => {
  it("extracts double-quoted -m subject", () => {
    const blocks = commitBlocks('git commit -m "fix: handle empty config"');
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "fix: handle empty config" }]);
  });

  it("extracts single-quoted -m subject", () => {
    const blocks = commitBlocks("git commit -m 'fix: handle empty config'");
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "fix: handle empty config" }]);
  });

  it("extracts first line of $'...' -m subject", () => {
    const blocks = commitBlocks("git commit -m $'fix: handle empty config\\n\\nbody'");
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "fix: handle empty config" }]);
  });

  it("skips git commit without -m", () => {
    expect(extractCommits(commitBlocks("git commit --allow-empty"))).toEqual([]);
  });

  it("extracts heredoc subject with single-quoted delimiter", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<'EOF'\nfeat: add retry to upload client\n\nbody\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("extracts heredoc subject with double-quoted delimiter", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<"EOF"\nfeat: add retry to upload client\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("extracts heredoc subject with unquoted non-EOF delimiter", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<MSG\nfeat: add retry to upload client\nMSG\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("extracts heredoc subject with <<- and tab-indented lines", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<-EOF\n\tfeat: add retry to upload client\n\tEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("allows a space between << and the delimiter", () => {
    const blocks = commitBlocks(`git commit -m "$(cat << 'EOF'\nfeat: add retry to upload client\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("skips leading blank lines in heredoc body", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<'EOF'\n\n\nfeat: add retry to upload client\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("skips heredoc with empty body", () => {
    expect(extractCommits(commitBlocks(`git commit -m "$(cat <<'EOF'\n\nEOF\n)"`))).toEqual([]);
  });

  it("skips heredoc with empty body and double-quoted delimiter", () => {
    expect(extractCommits(commitBlocks(`git commit -m "$(cat <<"EOF"\n\nEOF\n)"`))).toEqual([]);
  });

  it("treats delimiter with trailing spaces as end of body", () => {
    expect(extractCommits(commitBlocks(`git commit -m "$(cat <<'EOF'\n\nEOF   \n)"`))).toEqual([]);
  });

  it("unescapes \\\" in heredoc subject", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<'EOF'\\nfix: handle \\"quoted\\" args\\nEOF\\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: 'fix: handle "quoted" args' }]);
  });

  it("keeps plain quotes in heredoc subject", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<'EOF'\nfix: handle "quoted" args\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: 'fix: handle "quoted" args' }]);
  });

  it("extracts heredoc subject from escaped newlines", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<'EOF'\\nfeat: add retry to upload client\\n\\nEOF\\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("skips empty heredoc with escaped newlines", () => {
    expect(extractCommits(commitBlocks(`git commit -m "$(cat <<'EOF'\\n\\nEOF\\n)"`))).toEqual([]);
  });

  it("uses the first -m when heredoc is only in a later -m", () => {
    const blocks = commitBlocks(`git commit -m "fix: handle empty config" -m "$(cat <<'EOF'\nbody\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "fix: handle empty config" }]);
  });

  it("uses the first commit in an && chain when a later one has a heredoc", () => {
    const blocks = commitBlocks(
      `git add a && git commit -m "fix: handle empty config" && git add b && git commit -m "$(cat <<'EOF'\nfeat: add retry to upload client\nEOF\n)"`,
    );
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "fix: handle empty config" }]);
  });

  it("extracts heredoc subject when it is the first commit in an && chain", () => {
    const blocks = commitBlocks(
      `git commit -m "$(cat <<'EOF'\nfeat: add retry to upload client\nEOF\n)" && git commit -m "fix: handle empty config"`,
    );
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("does not take a later commit's heredoc subject when the first one is unparsable", () => {
    const blocks = commitBlocks(
      `git commit --author="A <a@b>" -m "$(cat <<'EOF'\nfeat: one\nEOF\n)" && git commit -m "$(cat <<'EOF'\nfeat: two\nEOF\n)"`,
    );
    expect(extractCommits(blocks)).toEqual([]);
  });

  it("extracts heredoc subject with --amend", () => {
    const blocks = commitBlocks(`git commit --amend -m "$(cat <<'EOF'\nfeat: add retry to upload client\nEOF\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("extracts heredoc subject with CRLF line endings", () => {
    const blocks = commitBlocks(`git commit -m "$(cat <<'EOF'\r\nfeat: add retry to upload client\r\n\r\nEOF\r\n)"`);
    expect(extractCommits(blocks)).toEqual([{ hash: "5416801", message: "feat: add retry to upload client" }]);
  });

  it("skips empty heredoc with CRLF line endings", () => {
    expect(extractCommits(commitBlocks(`git commit -m "$(cat <<'EOF'\r\n\r\nEOF\r\n)"`))).toEqual([]);
  });

  // `-q` makes git print no hash, so these commits are hashless.
  const quietBlocks = (command: string): NormalizedBlock[] => [
    { kind: "tool_call", name: "bash", args: { command } },
    { kind: "tool_result", name: "bash", text: "" },
  ];

  it("extracts the subject from combined short flags ending in m", () => {
    expect(extractCommits(quietBlocks('git commit -qam "chore: release v0.11.0"'))).toEqual([
      { hash: undefined, message: "chore: release v0.11.0" },
    ]);
  });

  it("extracts the heredoc subject after combined short flags", () => {
    const cmd = `git commit -qam "$(cat <<'EOF'\nfeat: add retry to upload client\nEOF\n)"`;
    expect(extractCommits(quietBlocks(cmd))).toEqual([{ hash: undefined, message: "feat: add retry to upload client" }]);
  });

  it("extracts the subject of a message piped to `-F -` through a heredoc", () => {
    const cmd = `git commit -q -F - <<'EOF'\nfeat: add retry to upload client\n\nbody\nEOF`;
    expect(extractCommits(quietBlocks(cmd))).toEqual([{ hash: undefined, message: "feat: add retry to upload client" }]);
  });

  it("keeps one entry per commit, preferring the hashed one in either order", () => {
    const hashless = quietBlocks('git commit -q -m "fix: handle empty config"');
    const hashed = commitBlocks('git commit -m "fix: handle empty config"');
    const want = [{ hash: "5416801", message: "fix: handle empty config" }];
    expect(extractCommits([...hashless, ...hashed])).toEqual(want);
    expect(extractCommits([...hashed, ...hashless])).toEqual(want);
    // Two commits that share a message but have different hashes stay two.
    const other = [
      { kind: "tool_call", name: "bash", args: { command: 'git commit -m "fix: handle empty config"' } },
      { kind: "tool_result", name: "bash", text: "[master 9999999] commit" },
    ] as NormalizedBlock[];
    expect(extractCommits([...hashed, ...other]).map((x) => x.hash)).toEqual(["5416801", "9999999"]);
  });
});
