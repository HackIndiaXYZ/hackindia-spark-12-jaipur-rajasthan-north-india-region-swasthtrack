/**
 * Server only. Importing this module makes patient-service (and the settings read)
 * use the client given to `runAsClient` instead of the shared anon client, for the
 * duration of that call only. Outside a `runAsClient` call nothing changes.
 *
 * This is how the e-mail jobs run the existing data services as a real, RLS-scoped
 * user (the signed-in person for alerts, a viewer-only notifier account for cron)
 * without a service-role key.
 */
import { setDbResolver } from "@/services/patient-service";
import { scopedClient } from "./als-scope";

setDbResolver(scopedClient);

export { runAsClient, scopedClient } from "./als-scope";
