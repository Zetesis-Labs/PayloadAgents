import { Tenant } from "@/payload-types";
import type { Payload } from "payload";

export const seedTenant =
  (payload: Payload, mode: "create" | "upsert") =>
  async (tenantData?: Tenant | null | number): Promise<Tenant> => {
    const logger = payload.logger;

    // Handle null/undefined case
    if (!tenantData) {
      throw new Error("Tenant data is required");
    }

    // Handle number case - only verify it exists
    if (typeof tenantData === "number") {
      try {
        const existing = await payload.findByID({
          collection: "tenants",
          id: tenantData,
        });
        logger.debug(`Tenant ${tenantData} exists`);
        return existing;
      } catch (error) {
        throw new Error(
          `Tenant con ID ${tenantData} no existe. Se necesita el objeto completo del tenant para crearlo automáticamente.`
        );
      }
    }

    // Handle object case
    logger.debug(`Processing tenant ${tenantData.id} with slug ${tenantData.slug}`);

    try {
      // Check if tenant exists - search by keycloakOrgId or slug (NOT by id from source data)
      let existingTenant = null;
      const searchFields = [];

      if (tenantData.keycloakOrgId) {
        searchFields.push({
          keycloakOrgId: {
            equals: tenantData.keycloakOrgId,
          },
        });
      }

      if (tenantData.slug) {
        searchFields.push({
          slug: {
            equals: tenantData.slug,
          },
        });
      }

      if (searchFields.length > 0) {
        const existingTenants = await payload.find({
          collection: "tenants",
          where: {
            or: searchFields,
          },
          limit: 1,
        });
        existingTenant = existingTenants.docs[0];
      }

      // If exists and mode is 'create', skip
      if (existingTenant && mode === "create") {
        logger.debug(
          `Tenant ${tenantData.slug} ya existe y modo es 'create', saltando...`,
        );
        return existingTenant;
      }

      // Prepare the data to insert/update
      const tenantPayload = {
        name: tenantData.name,
        domain: tenantData.domain,
        slug: tenantData.slug,
        allowPublicRead: tenantData.allowPublicRead ?? false,
        keycloakOrgId: tenantData.keycloakOrgId,
      };

      if (existingTenant) {
        // Update existing tenant
        const updated = await payload.update({
          collection: "tenants",
          id: existingTenant.id,
          data: tenantPayload,
        });
        logger.debug(`Tenant ${tenantData.slug} actualizado`);
        return updated;
      } else {
        // Create new tenant
        const createData: any = { ...tenantPayload };

        // Only include id if it's not null
        if (tenantData.id) {
          createData.id = tenantData.id;
        }

        const created = await payload.create({
          collection: "tenants",
          data: createData,
        });
        logger.debug(`Nuevo tenant creado con ID: ${created.id}`);
        return created;
      }
    } catch (error: any) {
      const tenantId =
        typeof tenantData === "number" ? tenantData : (tenantData.id || tenantData.keycloakOrgId || tenantData.slug || "unknown");
      logger.error(`Error al procesar tenant ${tenantId}:`);
      logger.error(error);

      // Log more detailed error information
      if (error.data) {
        logger.error("Error data:", error.data);
      }
      if (error.message) {
        logger.error("Error message:", error.message);
      }

      throw error;
    }
  };
