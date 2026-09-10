import { memoryExtractV1 } from "./v1.js";

export const CURRENT_MEMORY_EXTRACT = memoryExtractV1;

export function memoryExtractVersion(): string {
  return `${CURRENT_MEMORY_EXTRACT.id}@${CURRENT_MEMORY_EXTRACT.version}`;
}
