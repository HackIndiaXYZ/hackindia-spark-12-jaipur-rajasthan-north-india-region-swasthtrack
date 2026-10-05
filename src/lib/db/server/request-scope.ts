/**
 * Server only. Importing this module makes patient-service (and the settings read)
 * use the client given to `runAsClient` instead of the shared browser client, for the
 * duration of that call only. Outside a `runAsClient` call nothing changes.
 *
 * This is how the e-mail jobs run the existing data services as a real, access-scoped
 * principal (the signed-in person for alerts, a read-only system identity for cron).
 */
import { setDbResolver } from "@/services/patient-service";
import { scopedClient } from "./als-scope";

setDbResolver(scopedClient);

export { runAsClient, scopedClient } from "./als-scope";
