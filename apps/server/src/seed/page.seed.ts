import { Page, Taxonomy, Tenant } from "@/payload-types";
import type { Payload } from "payload";
import { seedTenant } from "./tenant.seed";
import { seedTaxonomy } from "./taxonomy.seed";

/**
 * Ensures a tenant exists, creating it if full data is provided
 * @throws Error if only ID is provided and tenant doesn't exist
 */
async function ensureTenantExists(
  payload: Payload,
  tenantData?: Tenant | number | null
): Promise<number | undefined> {
  if (!tenantData) return undefined;

  if (typeof tenantData === "number") {
    // Only ID provided - verify it exists
    try {
      await payload.findByID({
        collection: "tenants",
        id: tenantData,
      });
      return tenantData;
    } catch (error) {
      throw new Error(
        `Tenant con ID ${tenantData} no existe. Se necesita el objeto completo del tenant para crearlo automáticamente.`
      );
    }
  }

  // Full object provided - seed it
  if (tenantData?.id) {
    const tenantSeeder = seedTenant(payload, "upsert");
    const createdTenant = await tenantSeeder(tenantData);
    return createdTenant.id;
  }

  return undefined;
}

/**
 * Ensures taxonomies exist, creating them if full data is provided
 * @throws Error if only ID is provided and taxonomy doesn't exist
 */
async function ensureTaxonomiesExist(
  payload: Payload,
  categories?: (Taxonomy | number)[] | null
): Promise<number[]> {
  if (!categories || !Array.isArray(categories)) {
    return [];
  }

  const categoryIds: number[] = [];
  const taxonomySeeder = seedTaxonomy(payload, "upsert");

  for (const cat of categories) {
    if (typeof cat === "number") {
      // Only ID provided - verify it exists
      try {
        await payload.findByID({
          collection: "taxonomy",
          id: cat,
        });
        categoryIds.push(cat);
      } catch (error) {
        throw new Error(
          `Taxonomy con ID ${cat} no existe. Se necesita el objeto completo de la taxonomía para crearla automáticamente.`
        );
      }
    } else if (cat?.id || cat?.name) {
      // Full object provided - seed it
      const createdTaxonomy = await taxonomySeeder(cat);
      categoryIds.push(createdTaxonomy.id);
    }
  }

  return categoryIds;
}

export const seedPage =
  (payload: Payload, mode: "create" | "upsert") => async (pageData: Page) => {
    const logger = payload.logger;

    logger.debug(`Processing page ${pageData.id} with slug ${pageData.slug}`);

    try {
      // Check if page exists
      const existingPages = await payload.find({
        collection: "pages",
        where: {
          id: {
            equals: pageData.id,
          },
        },
        limit: 1,
      });

      const existingPage = existingPages.docs[0];

      // If exists and mode is 'create', skip
      if (existingPage && mode === "create") {
        logger.debug(
          `Página ${pageData.id} ya existe y modo es 'create', saltando...`,
        );
        return;
      }

      // Ensure related data exists
      const tenantId = await ensureTenantExists(payload, pageData.tenant);
      const categoryIds = await ensureTaxonomiesExist(payload, pageData.categories);

      // Prepare the data to insert/update
      const pagePayload = {
        tenant: tenantId,
        title: pageData.title,
        generateSlug: pageData.generateSlug,
        slug: pageData.slug,
        external_id: pageData.external_id,
        url: pageData.url,
        publishedAt: pageData.publishedAt,
        content: pageData.content,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        related_links_videos: pageData.related_links_videos,
        related_links_books: pageData.related_links_books,
        related_links_other: pageData.related_links_other,
      };

      if (existingPage) {
        // Update existing page
        await payload.update({
          collection: "pages",
          id: existingPage.id,
          data: pagePayload,
        });
        logger.debug(`Página ${pageData.id} actualizada`);
      } else {
        // Create new page
        await payload.create({
          collection: "pages",
          data: {
            ...pagePayload,
            id: pageData.id,
          },
        });
        logger.debug(`Nueva página creada con ID: ${pageData.id}`);
      }
    } catch (error: any) {
      logger.error(`Error al procesar página ${pageData.id}:`, error);
      throw error;
    }
  };
