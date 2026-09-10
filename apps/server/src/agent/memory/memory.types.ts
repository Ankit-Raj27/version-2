import type { MemoryFactStatus } from "../../db/schema.js";

export interface MemoryFactRow {
  id: number;
  contactId: number;
  fact: string;
  status: MemoryFactStatus;
  sourceMessageId: number | null;
  promptVersion: string;
  createdAt: number;
  updatedAt: number;
}

/** Public DTO for the contact facts API and the dashboard. */
export interface MemoryFactView {
  id: number;
  fact: string;
  status: MemoryFactStatus;
  sourceMessageId: number | null;
  createdAt: string;
}
