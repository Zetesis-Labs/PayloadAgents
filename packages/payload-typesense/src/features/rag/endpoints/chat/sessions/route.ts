import { CollectionSlug, Payload, PayloadRequest } from "payload";
import { logger } from "../../../../../core/logging/logger";
import {
  SessionConfig,
  getUserSessions,
} from "../../../handlers/session-handlers";
import { jsonResponse } from "../validators/index";

/**
 * Configuration for sessions list endpoint
 */
export type SessionsListEndpointConfig<TSlug extends CollectionSlug> = {
  /** Get Payload instance */
  getPayload: () => Promise<Payload>;
  checkPermissions: (request: PayloadRequest) => Promise<boolean>;
  /** Session configuration */
  sessionConfig?: SessionConfig<TSlug>;
};

/**
 * Create a parameterizable GET handler for sessions list endpoint
 *
 * GET /api/chat/sessions
 */
export function createSessionsListGETHandler<TSlug extends CollectionSlug>(
  config: SessionsListEndpointConfig<TSlug>,
) {
  return async function GET(request: PayloadRequest) {
    try {
      if (!(await config.checkPermissions(request))) {
        return jsonResponse(
          { error: "No tienes permisos para acceder." },
          { status: 403 },
        );
      }

      const userId = request.user?.id;
      if (!userId) {
        return jsonResponse(
          { error: "Usuario no autenticado" },
          { status: 401 },
        );
      }

      // Get Payload instance
      const payload = await config.getPayload();

      const sessions = await getUserSessions(
        payload,
        userId,
        config.sessionConfig,
      );

      return jsonResponse({ sessions });
    } catch (error) {
      logger.error("Error retrieving chat sessions list", error as Error, {
        userId: request.user?.id,
      });

      return jsonResponse(
        {
          error: "Error al recuperar el historial de chat.",
          details: error instanceof Error ? error.message : "Error desconocido",
        },
        { status: 500 },
      );
    }
  };
}
