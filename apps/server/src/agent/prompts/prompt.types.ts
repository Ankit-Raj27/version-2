import type { DraftContext } from "../context/context.types.js";

export interface PromptTemplate {
  readonly id: string;
  readonly version: string;
  build(context: DraftContext): { system: string; user: string };
}

export function promptVersionOf(template: PromptTemplate): string {
  return `${template.id}@${template.version}`;
}
