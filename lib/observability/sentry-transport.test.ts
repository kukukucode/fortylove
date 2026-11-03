import { sentryDataCollection } from "./sentry-data-collection";
import * as Sentry from "@sentry/nextjs";
import { expect, it } from "vitest";
import { scrubErrorEvent } from "./sentry-privacy";

it("the real SDK transport receives only the scrubbed event, without network access", async () => {
  const envelopes: unknown[] = [];
  Sentry.init({
    dsn: "https://public@example.invalid/1", defaultIntegrations: false,
    dataCollection: sentryDataCollection, tracesSampleRate: 0, beforeSend: scrubErrorEvent,
    transport: () => ({ send: async (envelope: unknown) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
  });
  try {
    const secret = "DO_NOT_SEND_PASSWORD_OR_QUESTION";
    Sentry.withScope(scope => {
      scope.setUser({ email: secret }); scope.setExtra("form", secret);
      Sentry.captureException(new TypeError(secret));
    });
    expect(await Sentry.flush(2000)).toBe(true);
    expect(envelopes.length).toBeGreaterThan(0);
    expect(JSON.stringify(envelopes)).not.toContain(secret);
    expect(JSON.stringify(envelopes)).toContain("sensitive details removed");
  } finally { await Sentry.close(2000); }
});
