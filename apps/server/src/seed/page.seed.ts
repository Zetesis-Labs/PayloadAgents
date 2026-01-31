import { Page } from "@/payload-types";
import type { Payload } from "payload";

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

      // Prepare the data to insert/update
      const pagePayload: any = {
        tenant:
          typeof pageData.tenant === "number"
            ? pageData.tenant
            : pageData.tenant?.id,
        title: pageData.title,
        generateSlug: pageData.generateSlug,
        slug: pageData.slug,
        external_id: pageData.external_id,
        url: pageData.url,
        publishedAt: pageData.publishedAt,
        content: pageData.content,
        categories: pageData.categories?.map((cat) =>
          typeof cat === "number" ? cat : cat.id,
        ),
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
