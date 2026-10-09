import { randomUUID } from "crypto";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { PipelineStatus } from "@/lib/lead/pipeline";
import { ownerDb } from "./client";
import { withTenantContext } from "./tenant-db";
import {
  chatMessages,
  chatSessions,
  leadStatusHistory,
  leads,
  type Lead,
} from "./schema";

export interface NewLead {
  gymId: string;
  name: string;
  phone: string;
  email?: string;
  goals: string;
  source?: string;
  sessionId?: string;
  conversationSummary?: string;
}

export interface UpdatePipelineOptions {
  source: "admin" | "sms";
  actorPhone?: string;
  note?: string;
}

export interface LeadRepository {
  create(lead: NewLead): Promise<Lead>;
  /**
   * Fetch a lead by primary key. Pass `gymId` to add a DB-level tenant filter
   * (defense-in-depth alongside RLS). Admin paths omit gymId; per-tenant paths
   * should always supply it so a wrong id never exposes another tenant's data.
   */
  getById(id: string, gymId?: string): Promise<Lead | null>;
  findByRef(ref: string, gymId?: string): Promise<Lead | null>;
  findLatestOpen(gymId?: string): Promise<Lead | null>;
  updatePipelineStatus(
    id: string,
    status: PipelineStatus,
    options: UpdatePipelineOptions,
  ): Promise<Lead | null>;
  list(gymId: string): Promise<Lead[]>;
  listAll(): Promise<Lead[]>;
  findRecentByPhone(
    gymId: string,
    phone: string,
    withinHours?: number,
  ): Promise<Lead | null>;
}

class SqliteLeadRepository implements LeadRepository {
  async create(lead: NewLead): Promise<Lead> {
    const now = new Date();
    const row: Lead = {
      id: randomUUID(),
      gymId: lead.gymId,
      sessionId: lead.sessionId ?? null,
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? null,
      goals: lead.goals,
      source: lead.source ?? "chat",
      pipelineStatus: "new",
      pipelineStatusUpdatedAt: now,
      conversationSummary: lead.conversationSummary ?? null,
      createdAt: now,
    };

    await withTenantContext(lead.gymId, async (tx) => {
      await tx.insert(leads).values(row);
      await tx.insert(leadStatusHistory).values({
        id: randomUUID(),
        leadId: row.id,
        gymId: row.gymId,
        status: "new",
        source: "system",
        actorPhone: null,
        note: "Lead captured from chat",
        createdAt: now,
      });
    });

    return row;
  }

  async getById(id: string, gymId?: string): Promise<Lead | null> {
    // With gymId: tenant-scoped read (RLS via GUC). Without: admin cross-tenant
    // lookup by primary key — use the owner connection.
    if (gymId) {
      return withTenantContext(gymId, async (tx) => {
        const rows = await tx
          .select()
          .from(leads)
          .where(and(eq(leads.id, id), eq(leads.gymId, gymId)))
          .limit(1);
        return rows[0] ?? null;
      });
    }
    const rows = await ownerDb
      .select()
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByRef(ref: string, gymId?: string): Promise<Lead | null> {
    const idPrefix = ref.toLowerCase();
    const likeFilter = sql`lower(replace(${leads.id}, '-', '')) LIKE ${`${idPrefix}%`}`;
    if (gymId) {
      return withTenantContext(gymId, async (tx) => {
        const rows = await tx
          .select()
          .from(leads)
          .where(and(eq(leads.gymId, gymId), likeFilter))
          .orderBy(desc(leads.createdAt))
          .limit(1);
        return rows[0] ?? null;
      });
    }
    const rows = await ownerDb
      .select()
      .from(leads)
      .where(likeFilter)
      .orderBy(desc(leads.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async findLatestOpen(gymId?: string): Promise<Lead | null> {
    const openFilter = sql`${leads.pipelineStatus} IN ('new', 'contacted', 'tour')`;
    if (gymId) {
      return withTenantContext(gymId, async (tx) => {
        const rows = await tx
          .select()
          .from(leads)
          .where(and(eq(leads.gymId, gymId), openFilter))
          .orderBy(desc(leads.createdAt))
          .limit(1);
        return rows[0] ?? null;
      });
    }
    const rows = await ownerDb
      .select()
      .from(leads)
      .where(openFilter)
      .orderBy(desc(leads.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async updatePipelineStatus(
    id: string,
    status: PipelineStatus,
    options: UpdatePipelineOptions,
  ): Promise<Lead | null> {
    // Cross-tenant lookup by id (owner) to discover the lead's gym, then do the
    // write inside that tenant's RLS context.
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const now = new Date();
    await withTenantContext(existing.gymId, async (tx) => {
      await tx
        .update(leads)
        .set({
          pipelineStatus: status,
          pipelineStatusUpdatedAt: now,
        })
        .where(eq(leads.id, id));

      await tx.insert(leadStatusHistory).values({
        id: randomUUID(),
        leadId: id,
        gymId: existing.gymId,
        status,
        source: options.source,
        actorPhone: options.actorPhone ?? null,
        note: options.note ?? null,
        createdAt: now,
      });
    });

    return this.getById(id, existing.gymId);
  }

  async list(gymId: string): Promise<Lead[]> {
    return withTenantContext(gymId, (tx) =>
      tx
        .select()
        .from(leads)
        .where(eq(leads.gymId, gymId))
        .orderBy(desc(leads.createdAt)),
    );
  }

  async listAll(): Promise<Lead[]> {
    // Admin cross-tenant — owner connection (RLS would otherwise hide rows).
    return ownerDb.select().from(leads).orderBy(desc(leads.createdAt));
  }

  async findRecentByPhone(
    gymId: string,
    phone: string,
    withinHours = 24,
  ): Promise<Lead | null> {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    return withTenantContext(gymId, async (tx) => {
      const rows = await tx
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.gymId, gymId),
            eq(leads.phone, phone),
            gte(leads.createdAt, since),
          ),
        )
        .orderBy(desc(leads.createdAt))
        .limit(1);
      return rows[0] ?? null;
    });
  }
}

let repository: LeadRepository | null = null;

export function getLeadRepository(): LeadRepository {
  if (!repository) {
    repository = new SqliteLeadRepository();
  }

  return repository;
}

export async function appendChatMessage(input: {
  sessionId: string;
  gymId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<void> {
  await withTenantContext(input.gymId, (tx) =>
    tx.insert(chatMessages).values({
      id: randomUUID(),
      sessionId: input.sessionId,
      gymId: input.gymId,
      role: input.role,
      content: input.content,
      createdAt: new Date(),
    }),
  );
}

/**
 * Fetch messages for a session. Pass `gymId` for the tenant-scoped RLS context
 * (required in production). Without it, falls back to the owner connection
 * (admin paths where the gym isn't known up front).
 */
export async function getChatMessages(sessionId: string, gymId?: string) {
  if (gymId) {
    return withTenantContext(gymId, (tx) =>
      tx
        .select()
        .from(chatMessages)
        .where(
          and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.gymId, gymId)),
        )
        .orderBy(chatMessages.createdAt),
    );
  }
  return ownerDb
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt);
}

export async function getChatMessagesForLead(lead: Lead) {
  if (lead.sessionId) {
    const linkedMessages = await getChatMessages(lead.sessionId, lead.gymId);
    if (linkedMessages.length > 0) {
      return linkedMessages;
    }
  }

  const phoneDigits = lead.phone.replace(/\D/g, "").slice(-10);
  const sessions = await withTenantContext(lead.gymId, (tx) =>
    tx
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.gymId, lead.gymId))
      .orderBy(desc(chatSessions.updatedAt)),
  );

  const matchedSession = sessions.find((session) => {
    const sessionPhone = session.leadPhone?.replace(/\D/g, "").slice(-10);
    return (
      session.id === lead.sessionId ||
      (sessionPhone && sessionPhone === phoneDigits) ||
      session.leadName?.trim().toLowerCase() === lead.name.trim().toLowerCase()
    );
  });

  if (!matchedSession) {
    return [];
  }

  return getChatMessages(matchedSession.id, lead.gymId);
}

/**
 * Fetch status history for a lead. Pass `gymId` for the tenant-scoped RLS
 * context (required in production); without it, uses the owner connection.
 */
export async function getLeadStatusHistory(leadId: string, gymId?: string) {
  if (gymId) {
    return withTenantContext(gymId, (tx) =>
      tx
        .select()
        .from(leadStatusHistory)
        .where(
          and(
            eq(leadStatusHistory.leadId, leadId),
            eq(leadStatusHistory.gymId, gymId),
          ),
        )
        .orderBy(desc(leadStatusHistory.createdAt)),
    );
  }
  return ownerDb
    .select()
    .from(leadStatusHistory)
    .where(eq(leadStatusHistory.leadId, leadId))
    .orderBy(desc(leadStatusHistory.createdAt));
}

export interface GymAnalytics {
  gymId: string;
  totalLeads: number;
  leadsThisWeek: number;
  chatSessions: number;
  chatMessages: number;
  leadsByStatus: Record<string, number>;
}

export async function getGymAnalytics(gymId: string): Promise<GymAnalytics> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // All four counts must share one transaction so the app.gym_id GUC applies
  // to each (RLS-gated tables). Sequential within the single tenant context.
  const { leadRows, sessionCount, messageCount, weekLeadCount } =
    await withTenantContext(gymId, async (tx) => {
      const leadRows = await tx.select().from(leads).where(eq(leads.gymId, gymId));
      const sessionCount = await tx
        .select({ value: count() })
        .from(chatSessions)
        .where(eq(chatSessions.gymId, gymId));
      const messageCount = await tx
        .select({ value: count() })
        .from(chatMessages)
        .where(eq(chatMessages.gymId, gymId));
      const weekLeadCount = await tx
        .select({ value: count() })
        .from(leads)
        .where(and(eq(leads.gymId, gymId), gte(leads.createdAt, weekAgo)));
      return { leadRows, sessionCount, messageCount, weekLeadCount };
    });

  const leadsByStatus: Record<string, number> = {
    new: 0,
    contacted: 0,
    tour: 0,
    signed: 0,
    lost: 0,
  };

  for (const lead of leadRows) {
    const key = lead.pipelineStatus ?? "new";
    leadsByStatus[key] = (leadsByStatus[key] ?? 0) + 1;
  }

  return {
    gymId,
    totalLeads: leadRows.length,
    leadsThisWeek: weekLeadCount[0]?.value ?? 0,
    chatSessions: sessionCount[0]?.value ?? 0,
    chatMessages: messageCount[0]?.value ?? 0,
    leadsByStatus,
  };
}

export async function getAllGymAnalytics(): Promise<GymAnalytics[]> {
  // Admin cross-tenant aggregate — owner connection for the distinct scan, then
  // per-gym analytics each run in their own tenant context.
  const gymIds = await ownerDb
    .selectDistinct({ gymId: leads.gymId })
    .from(leads);

  const ids = new Set(gymIds.map((row) => row.gymId));
  ids.add("demo-gym");

  return Promise.all(Array.from(ids).map((gymId) => getGymAnalytics(gymId)));
}
