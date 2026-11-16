import { sentryDataCollection } from "@/lib/observability/sentry-data-collection";
import * as Sentry from "@sentry/nextjs";
import { scrubErrorEvent } from "@/lib/observability/sentry-privacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  dataCollection: sentryDataCollection,
  defaultIntegrations: false,
  tracesSampleRate: 0,
  beforeSend: scrubErrorEvent,
  beforeBreadcrumb: () => null,
});
