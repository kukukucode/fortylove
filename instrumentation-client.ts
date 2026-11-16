import { sentryDataCollection } from "@/lib/observability/sentry-data-collection";
import * as Sentry from "@sentry/nextjs";
import { scrubErrorEvent } from "@/lib/observability/sentry-privacy";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  dataCollection: sentryDataCollection,
  defaultIntegrations: false,
  integrations: [Sentry.globalHandlersIntegration(), Sentry.browserApiErrorsIntegration(), Sentry.dedupeIntegration()],
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: scrubErrorEvent,
  beforeBreadcrumb: () => null,
});
