import "dotenv/config";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://3b0788b88b1203668fd993c64bdebc8f@o4510568686092288.ingest.us.sentry.io/4510583026024448",
  sendDefaultPii: true,

  tracesSampleRate: 1.0,
});