import type { IdentityContext } from './identity-context';

/**
 * Every gateway→service (and orchestrator→service) NATS request is wrapped in
 * this envelope: the propagated identity, the actual payload, and optional
 * metadata (correlation id, saga id). Keeping identity out of the payload
 * means DTOs stay clean and identity handling is uniform across services.
 */
export interface RequestEnvelope<TPayload> {
  identity: IdentityContext;
  payload: TPayload;
  meta?: {
    correlationId?: string;
    sagaId?: string;
  };
}

export function envelope<TPayload>(
  identity: IdentityContext,
  payload: TPayload,
  meta?: RequestEnvelope<TPayload>['meta'],
): RequestEnvelope<TPayload> {
  return { identity, payload, meta };
}
