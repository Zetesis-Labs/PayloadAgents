import { Post, Taxonomy, Tenant } from "@/payload-types";
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

export const seedPost =
  (payload: Payload, mode: "create" | "upsert") => async (postData: Post) => {
    const logger = payload.logger;

    logger.debug(`Processing post ${postData.id} with slug ${postData.slug}`);

    try {
      // Check if post exists
      const existingPosts = await payload.find({
        collection: "posts",
        where: {
          id: {
            equals: postData.id,
          },
        },
        limit: 1,
      });

      const existingPost = existingPosts.docs[0];

      // If exists and mode is 'create', skip
      if (existingPost && mode === "create") {
        logger.debug(
          `Post ${postData.id} ya existe y modo es 'create', saltando...`,
        );
        return;
      }

      // Ensure related data exists
      const tenantId = await ensureTenantExists(payload, postData.tenant);
      const categoryIds = await ensureTaxonomiesExist(payload, postData.categories);

      // Prepare the data to insert/update
      const postPayload = {
        tenant: tenantId,
        title: postData.title,
        generateSlug: postData.generateSlug,
        slug: postData.slug,
        external_id: postData.external_id,
        url: postData.url,
        publishedAt: postData.publishedAt,
        content: postData.content,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        related_links_videos: postData.related_links_videos,
        related_links_books: postData.related_links_books,
        related_links_other: postData.related_links_other,
      };

      if (existingPost) {
        // Update existing post
        await payload.update({
          collection: "posts",
          id: existingPost.id,
          data: postPayload,
        });
        logger.debug(`Post ${postData.id} actualizado`);
      } else {
        // Create new post
        await payload.create({
          collection: "posts",
          data: {
            ...postPayload,
            id: postData.id,
          },
        });
        logger.debug(`Nuevo post creado con ID: ${postData.id}`);
      }
    } catch (error: any) {
      logger.error(`Error al procesar post ${postData.id}:`, error);
      throw error;
    }
  };
