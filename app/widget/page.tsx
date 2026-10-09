import { headers } from "next/headers";
import ChatWidget from "@/components/ChatWidget";
import { EmbedUnavailableSignal } from "@/components/EmbedUnavailableSignal";
import { isEmbeddedRequest } from "@/lib/embed/is-embedded-request";
import { isAllowedEmbedOrigin } from "@/lib/embed/token";
import { buildPublicWidgetConfig } from "@/lib/gym/branding";
import { ensureGymLoaded } from "@/lib/gym/db-config";
import { isRegisteredGym } from "@/lib/gym/registry";
import { loadTenantConfig } from "@/lib/gym/tenant-config";

export const dynamic = "force-dynamic";

const BLANK = (
  <main data-widget-unavailable className="h-0 w-0 overflow-hidden bg-transparent">
    <EmbedUnavailableSignal />
  </main>
);

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: { gym?: string; token?: string };
}) {
  const gymId = searchParams.gym;
  const requestHeaders = headers();

  if (!isEmbeddedRequest(requestHeaders)) {
    return BLANK;
  }

  if (!gymId || !(await isRegisteredGym(gymId))) {
    return BLANK;
  }

  let widgetProps: {
    gymName?: string;
    accentColor?: string;
    publicPhone?: string;
    greeting?: string;
    quickStarts?: string[];
  } = {};

  try {
    await ensureGymLoaded(gymId);
    const config = await loadTenantConfig(gymId);

    // Per-tenant allowed-origins gate. When the gym has configured
    // allowedOrigins, the widget only loads inside iframes on those domains.
    // The Referer on an iframe page-load is the PARENT page's URL — exactly
    // what we want. Browsers cannot spoof Referer via JS.
    if (
      !isAllowedEmbedOrigin(
        requestHeaders.get("referer"),
        requestHeaders.get("host"),
        config.allowedOrigins ?? [],
      )
    ) {
      return BLANK;
    }

    const publicConfig = buildPublicWidgetConfig(gymId, config);
    widgetProps = {
      gymName: publicConfig.name,
      accentColor: publicConfig.branding.accentColor,
      publicPhone: publicConfig.publicPhone,
      greeting: publicConfig.branding.greeting,
      quickStarts: publicConfig.branding.quickStarts,
    };
  } catch {
    /* fall through to client fetch + defaults */
  }

  return (
    <main data-widget-embed className="overflow-hidden bg-transparent">
      <ChatWidget
        gymId={gymId}
        gymName={widgetProps.gymName}
        accentColor={widgetProps.accentColor}
        publicPhone={widgetProps.publicPhone}
        greeting={widgetProps.greeting}
        quickStarts={widgetProps.quickStarts}
        embedToken={searchParams.token}
      />
    </main>
  );
}
