import type { Payload, PayloadRequest } from "payload";
import type { BaseUser } from "../../../types/index.js";
import type { StripeEndpointConfig } from "../../plugin/stripe-inventory-types.js";

/**
 * Creates a JSON response using Web API Response
 */
export function jsonResponse(data: unknown, options?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
}

/**
 * Creates a redirect response using Web API Response
 * @param url - The URL to redirect to
 * @param status - HTTP status code (default: 303 See Other)
 */
export function redirectResponse(url: string, status: number = 303): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

/**
 * Creates an error response
 */
export function errorResponse(
  message: string,
  status: number = 400
): Response {
  return jsonResponse({ error: message }, { status });
}

/**
 * Result type for validateAuthenticatedRequest
 */
export type AuthenticatedRequestResult =
  | { success: false; error: Response }
  | {
      success: true;
      user: BaseUser;
      payload: Payload;
    };

/**
 * Validates that the request has an authenticated user
 * Uses the config's resolveUser if provided, otherwise uses request.user
 */
export async function validateAuthenticatedRequest(
  request: PayloadRequest,
  config: StripeEndpointConfig
): Promise<AuthenticatedRequestResult> {
  // Check custom permissions if provided
  if (config.checkPermissions) {
    const hasPermission = await config.checkPermissions(request);
    if (!hasPermission) {
      return {
        success: false,
        error: errorResponse("Permission denied", 403),
      };
    }
  }

  // Resolve user
  let user: BaseUser | null = null;

  if (config.resolveUser) {
    user = await config.resolveUser(request);
  } else {
    user = request.user as BaseUser | null;
  }

  if (!user) {
    return {
      success: false,
      error: errorResponse("You must be logged in to access this endpoint", 401),
    };
  }

  if (!user.email) {
    return {
      success: false,
      error: errorResponse("User email is required", 400),
    };
  }

  return {
    success: true,
    user,
    payload: request.payload,
  };
}
