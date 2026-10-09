/**
 * Dialect-switching schema facade.
 *
 * Query sites import table objects from this module. At runtime the active
 * dialect's table objects are exported (SQLite locally, Postgres when
 * DATABASE_DRIVER=postgres), while the TypeScript surface stays that of the
 * SQLite schema — both schemas are field-for-field mirrors, so inferred row
 * types are identical (timestamps -> Date, booleans -> boolean).
 *
 * Edit columns in BOTH ./sqlite-schema.ts and ./pg-schema.ts.
 */
import * as sqliteSchema from "./sqlite-schema";
import * as pgSchema from "./pg-schema";
import { isPostgres } from "./driver";

const active = (isPostgres
  ? pgSchema
  : sqliteSchema) as unknown as typeof sqliteSchema;

export const gyms = active.gyms;
export const gymUsers = active.gymUsers;
export const leads = active.leads;
export const chatSessions = active.chatSessions;
export const chatMessages = active.chatMessages;
export const leadStatusHistory = active.leadStatusHistory;
export const chatTurnMetrics = active.chatTurnMetrics;
export const faqChunks = active.faqChunks;
export const prospects = active.prospects;

export type {
  Lead,
  NewLeadRow,
  ChatSession,
  ChatMessage,
  LeadStatusHistory,
  ChatTurnMetric,
  FaqChunkRow,
  Gym,
  GymUser,
  Prospect,
  NewProspect,
  CaptureLeadStatus,
} from "./sqlite-schema";
