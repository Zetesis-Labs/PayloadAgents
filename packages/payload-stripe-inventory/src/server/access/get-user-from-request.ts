import type { PayloadRequest } from "payload";
import type { BaseUser } from "../../types/index.js";

/**
 * Gets the current user from a PayloadRequest without depending on next/headers.
 * This is the recommended way to get the user in Payload endpoint handlers.
 *
 * @param request - The PayloadRequest object
 * @returns The user object or null if not authenticated
 */
export function getUserFromRequest(request: PayloadRequest): BaseUser | null {
  return request.user as BaseUser | null;
}
