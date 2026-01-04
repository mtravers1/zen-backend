import "dotenv/config";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://3b0788b88b1203668fd993c64bdebc8f@o4510568686092288.ingest.us.sentry.io/4510583026024448",
  sendDefaultPii: true,
  integrations: [
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  // Enable logs to be sent to Sentry
  enableLogs: true,
  tracesSampleRate: 1.0,
});
