"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TenantSetupPanel } from "@/components/admin/TenantSetupPanel";
import {
  PIPELINE_STATUSES,
  PIPELINE_STATUS_LABELS,
  type PipelineStatus,
} from "@/lib/lead/pipeline";

type Lead = {
  id: string;
  gymId: string;
  sessionId: string | null;
  name: string;
  phone: string;
  goals: string;
  source: string;
  pipelineStatus: PipelineStatus;
  pipelineStatusUpdatedAt: string | null;
  conversationSummary: string | null;
  createdAt: string;
};

type Analytics = {
  gymId: string;
  totalLeads: number;
  leadsThisWeek: number;
  chatSessions: number;
  chatMessages: number;
  leadsByStatus: Record<string, number>;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type StatusHistory = {
  id: string;
  status: string;
  source: string;
  actorPhone: string | null;
  note: string | null;
  createdAt: string;
};

const STATUS_COLORS: Record<PipelineStatus, string> = {
  new: "bg-sky-100 text-sky-800",
  contacted: "bg-amber-100 text-amber-900",
  tour: "bg-violet-100 text-violet-900",
  signed: "bg-emerald-100 text-emerald-900",
  lost: "bg-zinc-200 text-zinc-700",
};

type TenantOption = { id: string; name: string };
type LoginMode = "agency" | "client";

export default function AdminDashboardPage() {
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<LoginMode>("agency");
  const [clientEmail, setClientEmail] = useState("");
  const [clientGymId, setClientGymId] = useState("");
  const [gymOptions, setGymOptions] = useState<TenantOption[]>([]);
  const [gymId, setGymId] = useState<string>("");
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const dashboardLoadRef = useRef(0);
  const leadDetailLoadRef = useRef(0);

  const fetchDashboardData = useCallback(async (selectedGymId: string) => {
    const [leadsRes, analyticsRes] = await Promise.all([
      fetch(`/api/leads?gymId=${encodeURIComponent(selectedGymId)}`, {
        credentials: "include",
      }),
      fetch(`/api/admin/analytics?gymId=${encodeURIComponent(selectedGymId)}`, {
        credentials: "include",
      }),
    ]);

    if (leadsRes.status === 401 || analyticsRes.status === 401) {
      setIsAuthed(false);
      setLeads([]);
      setAnalytics(null);
      throw new Error("Session expired — please sign in again.");
    }

    if (!leadsRes.ok || !analyticsRes.ok) {
      throw new Error("Failed to load dashboard data");
    }

    const leadsData = (await leadsRes.json()) as { leads: Lead[] };
    const analyticsData = (await analyticsRes.json()) as {
      analytics: Analytics;
    };

    return {
      leads: leadsData.leads,
      analytics: analyticsData.analytics,
    };
  }, []);

  const loadDashboard = useCallback(
    async (selectedGymId: string) => {
      const loadId = ++dashboardLoadRef.current;
      setIsDashboardLoading(true);
      setError("");

      try {
        const data = await fetchDashboardData(selectedGymId);
        if (loadId !== dashboardLoadRef.current) {
          return;
        }
        setLeads(data.leads);
        setAnalytics(data.analytics);
      } catch (loadError) {
        if (loadId !== dashboardLoadRef.current) {
          return;
        }
        throw loadError;
      } finally {
        if (loadId === dashboardLoadRef.current) {
          setIsDashboardLoading(false);
        }
      }
    },
    [fetchDashboardData],
  );

  const loadGymOptions = useCallback(async (): Promise<TenantOption[]> => {
    const response = await fetch("/api/admin/gyms", { credentials: "include" });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { gyms: TenantOption[] };
    setGymOptions(data.gyms);
    return data.gyms;
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      if (loginMode === "agency") {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ password }),
        });

        if (!response.ok) {
          throw new Error("Invalid admin password");
        }

        setIsGlobalAdmin(true);
        setIsAuthed(true);
        const options = await loadGymOptions();
        const initial = options[0]?.id;
        if (!initial) {
          throw new Error("No tenants found — check database connection.");
        }
        setGymId(initial);
        await loadDashboard(initial);
      } else {
        const response = await fetch("/api/admin/gym-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            gymId: clientGymId.trim(),
            email: clientEmail.trim(),
            password,
          }),
        });

        if (!response.ok) {
          throw new Error("Invalid business ID, email, or password");
        }

        const data = (await response.json()) as {
          user: { gymId: string };
        };
        setIsGlobalAdmin(false);
        setIsAuthed(true);
        setGymId(data.user.gymId);
        await loadGymOptions();
        await loadDashboard(data.user.gymId);
      }
    } catch (loginError) {
      setIsAuthed(false);
      setError(
        loginError instanceof Error ? loginError.message : "Failed to login",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    await Promise.all([
      fetch("/api/admin/login", { method: "DELETE", credentials: "include" }),
      fetch("/api/admin/gym-login", { method: "DELETE", credentials: "include" }),
    ]);
    setIsAuthed(false);
    setIsGlobalAdmin(false);
    setLeads([]);
    setAnalytics(null);
    setPassword("");
  }

  async function switchGym(nextGymId: string) {
    if (nextGymId === gymId) {
      return;
    }

    const loadId = ++dashboardLoadRef.current;
    leadDetailLoadRef.current += 1;
    setGymId(nextGymId);
    setExpandedLeadId(null);
    setMessages([]);
    setHistory([]);
    setLeads([]);
    setAnalytics(null);
    setIsDashboardLoading(true);
    setError("");

    try {
      const data = await fetchDashboardData(nextGymId);
      if (loadId !== dashboardLoadRef.current) {
        return;
      }
      setLeads(data.leads);
      setAnalytics(data.analytics);
    } catch (switchError) {
      if (loadId !== dashboardLoadRef.current) {
        return;
      }
      setError(
        switchError instanceof Error
          ? switchError.message
          : "Failed to load tenant",
      );
    } finally {
      if (loadId === dashboardLoadRef.current) {
        setIsDashboardLoading(false);
      }
    }
  }

  async function updateStatus(leadId: string, pipelineStatus: PipelineStatus) {
    setUpdatingId(leadId);
    setError("");

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pipelineStatus }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      await loadDashboard(gymId);
      if (expandedLeadId === leadId) {
        await loadLeadDetail(leadId);
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update status",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function loadLeadDetail(leadId: string) {
    const loadId = ++leadDetailLoadRef.current;
    const response = await fetch(`/api/leads/${leadId}`, {
      credentials: "include",
    });

    if (loadId !== leadDetailLoadRef.current) {
      return;
    }

    if (response.status === 401) {
      setIsAuthed(false);
      setAnalytics(null);
      setLeads([]);
      throw new Error("Session expired — please sign in again.");
    }

    if (!response.ok) {
      throw new Error("Failed to load lead detail");
    }

    const data = (await response.json()) as {
      messages: ChatMessage[];
      history: StatusHistory[];
    };

    if (loadId !== leadDetailLoadRef.current) {
      return;
    }

    setMessages(data.messages);
    setHistory(data.history);
  }

  async function toggleExpand(leadId: string) {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      setMessages([]);
      setHistory([]);
      return;
    }

    setExpandedLeadId(leadId);
    setError("");

    try {
      await loadLeadDetail(leadId);
    } catch (detailError) {
      setExpandedLeadId(null);
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Failed to load chat transcript",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      try {
        const adminRes = await fetch("/api/admin/login", {
          credentials: "include",
        });

        if (adminRes.ok) {
          if (cancelled) return;
          setIsGlobalAdmin(true);
          setIsAuthed(true);
          const options = await loadGymOptions();
          const initial = options[0]?.id;
          if (!initial) {
            setError("No tenants found — check database connection.");
            return;
          }
          setGymId(initial);
          await loadDashboard(initial);
          return;
        }

        const gymRes = await fetch("/api/admin/gym-login", {
          credentials: "include",
        });

        if (!gymRes.ok || cancelled) {
          return;
        }

        const data = (await gymRes.json()) as { user: { gymId: string } };
        setIsGlobalAdmin(false);
        setIsAuthed(true);
        setGymId(data.user.gymId);
        await loadGymOptions();
        await loadDashboard(data.user.gymId);
      } catch (sessionError) {
        if (!cancelled) {
          setError(
            sessionError instanceof Error
              ? sessionError.message
              : "Failed to restore admin session",
          );
        }
      } finally {
        if (!cancelled) {
          setSessionChecked(true);
        }
      }
    }

    checkExistingSession();

    return () => {
      cancelled = true;
    };
    // Restore cookie session once on mount; gym changes reload via the select handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashboardReady =
    Boolean(analytics) &&
    analytics !== null &&
    analytics.gymId === gymId &&
    !isDashboardLoading;
  const activeAnalytics = dashboardReady ? analytics : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900 [color-scheme:light]">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to website
        </a>
        <h1 className="mt-4 text-3xl font-bold text-zinc-900">
          {!isAuthed
            ? "Staff dashboard"
            : isGlobalAdmin
              ? "Agency dashboard"
              : "Lead dashboard"}
        </h1>
        <p className="mt-2 text-zinc-600">
          {!isAuthed
            ? "Sign in to view leads and manage your chat widget clients."
            : isGlobalAdmin
              ? "Manage tenant branding, embed setup, and leads across your clients."
              : "See how many leads your chat is generating, review conversations, and update follow-up status."}
        </p>

        {!isAuthed && sessionChecked ? (
          <form onSubmit={login} className="mt-8 max-w-md space-y-3">
            <div className="flex gap-2">
              {(["agency", "client"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLoginMode(mode)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${
                    loginMode === mode
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-700"
                  }`}
                >
                  {mode === "agency" ? "Agency admin" : "Business login"}
                </button>
              ))}
            </div>

            {loginMode === "client" && (
              <>
                <input
                  type="text"
                  value={clientGymId}
                  onChange={(event) => setClientGymId(event.target.value)}
                  placeholder="Business ID (e.g. demo-gym)"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-zinc-900"
                />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(event) => setClientEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-zinc-900"
                />
              </>
            )}

            <div className="flex gap-3">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  loginMode === "agency" ? "Dashboard password" : "Password"
                }
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-zinc-900"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        ) : !isAuthed ? (
          <p className="mt-8 text-sm text-zinc-500">Checking session...</p>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            {isGlobalAdmin && gymOptions.length > 1 ? (
              <select
                value={gymId}
                onChange={(event) => switchGym(event.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900"
              >
                {gymOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-medium text-zinc-700">
                {gymOptions.find((option) => option.id === gymId)?.name ?? gymId}
              </p>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700"
            >
              Sign out
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {isAuthed && gymId ? (
          <>
            {isGlobalAdmin ? (
              <TenantSetupPanel
                key={gymId}
                gymId={gymId}
                tenantName={
                  gymOptions.find((option) => option.id === gymId)?.name ?? gymId
                }
              />
            ) : null}

            {!dashboardReady || !activeAnalytics ? (
              <p className="mt-8 text-sm text-zinc-500">Loading dashboard...</p>
            ) : (
              <>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Total leads" value={activeAnalytics.totalLeads} />
                  <StatCard
                    label="Leads this week"
                    value={activeAnalytics.leadsThisWeek}
                  />
                  <StatCard
                    label="Chat sessions"
                    value={activeAnalytics.chatSessions}
                  />
                  <StatCard
                    label="Conversion rate"
                    value={
                      activeAnalytics.totalLeads > 0
                        ? Math.round(
                            ((activeAnalytics.leadsByStatus.signed ?? 0) /
                              activeAnalytics.totalLeads) *
                              100,
                          )
                        : 0
                    }
                    suffix="%"
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {PIPELINE_STATUSES.map((status) => (
                    <span
                      key={status}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}
                    >
                      {PIPELINE_STATUS_LABELS[status]}:{" "}
                      {activeAnalytics.leadsByStatus[status] ?? 0}
                    </span>
                  ))}
                </div>

                <div className="mt-8 space-y-4">
                  <h2 className="text-lg font-semibold text-zinc-900">Leads</h2>
                  {leads.length === 0 ? (
                    <p className="text-zinc-500">No leads captured yet.</p>
                  ) : (
                    leads.map((lead) => (
                      <div
                        key={lead.id}
                        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-zinc-900">
                              {lead.name}
                            </h3>
                            <p className="text-sm text-zinc-600">{lead.phone}</p>
                            <p className="mt-2 text-sm text-zinc-700">
                              <span className="font-medium">Goals:</span>{" "}
                              {lead.goals}
                            </p>
                            <p className="mt-1 text-xs text-zinc-400">
                              {new Date(lead.createdAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <select
                              value={lead.pipelineStatus ?? "new"}
                              disabled={updatingId === lead.id}
                              onChange={(event) =>
                                updateStatus(
                                  lead.id,
                                  event.target.value as PipelineStatus,
                                )
                              }
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                            >
                              {PIPELINE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {PIPELINE_STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => toggleExpand(lead.id)}
                              className="text-sm text-zinc-600 underline"
                            >
                              {expandedLeadId === lead.id ? "Hide" : "View"} chat
                            </button>
                          </div>
                        </div>

                        {expandedLeadId === lead.id && (
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                              <h4 className="text-sm font-semibold text-zinc-800">
                                Chat transcript
                              </h4>
                              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl bg-zinc-50 p-3">
                                {messages.length === 0 ? (
                                  <p className="text-xs text-zinc-500">
                                    No messages logged for this session yet.
                                  </p>
                                ) : (
                                  messages.map((message) => (
                                    <div key={message.id} className="text-xs">
                                      <span className="font-medium uppercase text-zinc-500">
                                        {message.role}
                                      </span>
                                      <p className="mt-1 whitespace-pre-wrap text-zinc-800">
                                        {message.content}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-zinc-800">
                                Status history
                              </h4>
                              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl bg-zinc-50 p-3">
                                {history.map((entry) => (
                                  <div key={entry.id} className="text-xs text-zinc-700">
                                    <span
                                      className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[entry.status as PipelineStatus] ?? "bg-zinc-100"}`}
                                    >
                                      {PIPELINE_STATUS_LABELS[
                                        entry.status as PipelineStatus
                                      ] ?? entry.status}
                                    </span>
                                    <span className="ml-2 text-zinc-500">
                                      via {entry.source}
                                      {entry.actorPhone
                                        ? ` · ${entry.actorPhone}`
                                        : ""}
                                    </span>
                                    <p className="mt-1 text-zinc-400">
                                      {new Date(entry.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-zinc-900">
        {value}
        {suffix ? <span className="text-xl">{suffix}</span> : null}
      </p>
    </div>
  );
}
