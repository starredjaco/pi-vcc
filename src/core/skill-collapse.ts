/** Shared skill-tag collapse utilities */

/** Collapse <skill name="X" ...>...</skill> blocks in raw text */
export const SKILL_BLOCK_RE = /<skill\s+name="([^"]+)"[^>]*>[\s\S]*?(?:<\/skill>|$)/g;
export const collapseSkillText = (text: string): string =>
  text.replace(SKILL_BLOCK_RE, (_, name) => `[skill: ${name}]`);
