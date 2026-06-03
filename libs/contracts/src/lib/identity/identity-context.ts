/**
 * The authenticated caller's identity, established once by the gateway from a
 * verified JWT and propagated to internal services inside every NATS message
 * envelope. Internal services trust it (they are network-isolated and only
 * reachable through the gateway) and never re-verify the token.
 */
export interface IdentityContext {
  userId: string;
  email: string;
  roles: string[];
}
