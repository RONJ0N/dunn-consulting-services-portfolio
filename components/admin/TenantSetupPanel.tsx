"use client";

import { BrandingSettingsCard } from "@/components/admin/BrandingSettingsCard";
import { NotificationSettingsCard } from "@/components/admin/NotificationSettingsCard";
import { useEffect, useRef, useState } from "react";

type TenantSetupPanelProps = {
  gymId: string;
  tenantName: string;
};

function EmbedSnippetCard({ gymId }: { gymId: string }) {
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const tokenLoadRef = useRef(0);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const loadId = ++tokenLoadRef.current;
    setToken(null);
    setCopied(false);
    setTokenLoading(true);

    fetch(`/api/admin/embed-token?gymId=${encodeURIComponent(gymId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (loadId !== tokenLoadRef.current) {
          return;
        }
        if (data && typeof data.token === "string") {
          setToken(data.token);
        } else {
          setToken(null);
        }
      })
      .catch(() => {
        if (loadId === tokenLoadRef.current) {
          setToken(null);
        }
      })
      .finally(() => {
        if (loadId === tokenLoadRef.current) {
          setTokenLoading(false);
        }
      });
  }, [gymId]);

  const tokenAttr = token ? ` data-token="${token}"` : "";
  const snippet = `<script src="${origin}/embed.js" data-gym-id="${gymId}"${tokenAttr} async></script>`;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-zinc-900 [color-scheme:light]">
      <h2 className="text-lg font-semibold text-zinc-900">Embed snippet</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Add this one-line snippet to the client&apos;s website so visitors get the
        branded chat widget. Paste before the closing{" "}
        <code className="rounded bg-zinc-100 px-1 text-zinc-800">&lt;/body&gt;</code> tag.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <code className="flex-1 break-all rounded-xl bg-zinc-100 p-3 text-xs text-zinc-800">
          {tokenLoading ? "Loading embed token…" : snippet}
        </code>
        <button
          type="button"
          disabled={tokenLoading}
          onClick={() => {
            navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * Agency-only tenant configuration block. Parent must pass key={gymId} so this
 * entire subtree remounts on tenant switch (one branding card, no stale forms).
 */
export function TenantSetupPanel({ gymId, tenantName }: TenantSetupPanelProps) {
  return (
    <section className="mt-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Tenant setup</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Configure widget branding, Calendly links, logos, and quick-start buttons
          for <span className="font-medium text-zinc-800">{tenantName}</span>.
        </p>
      </div>
      <BrandingSettingsCard gymId={gymId} />
      <NotificationSettingsCard gymId={gymId} />
      <EmbedSnippetCard gymId={gymId} />
    </section>
  );
}
