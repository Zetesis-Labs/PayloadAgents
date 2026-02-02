import { getPayload } from "@/modules/get-payload";
import { Taxonomy, Tenant } from "@/payload-types";

// ============================================================================
// TRANSFORMS
// ============================================================================

/**
 * Transform categories relationship to taxonomy slugs array
 */
/**
 * Extrae la jerarquía de slugs de los breadcrumbs de la última categoría
 * Ejemplo: categories = [ { ..., breadcrumbs: [ { url: '/autor', label: 'Autor' }, { url: '/autor/hoppe', label: 'Hoppe' } ] } ]
 * Devuelve: ['autor', 'hoppe']
 */
export const transformCategories = async (categories?: (number | Taxonomy)[]): Promise<string[]> => {
    console.error('transformCategories called with:', categories);
if (!categories || categories.length === 0) return [];

  let docs: Taxonomy[] = [];

  // Verificamos el tipo del primer elemento asumiendo homogeneidad
  if (typeof categories[0] === 'number') {
    const payload = await getPayload();
    const ids = categories as number[];

    // Traemos todas las categorías de una vez
    const { docs: foundDocs } = await payload.find({
      collection: 'taxonomy',
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 1,
    });
    
    docs = foundDocs;
  } else {
    docs = categories as Taxonomy[];
  }  
  // Buscar la última categoría que tenga breadcrumbs
  const lastWithBreadcrumbs = [...docs]
    .reverse()
    .find(
      (cat) =>
        cat &&
        typeof cat === "object" &&
        Array.isArray((cat as any).breadcrumbs),
    );
  if (!lastWithBreadcrumbs) return [];
  const breadcrumbs = (lastWithBreadcrumbs as any).breadcrumbs;
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) return [];
  // Tomar el último breadcrumb válido con url
  const last = [...breadcrumbs]
    .reverse()
    .find(
      (b) =>
        b && typeof b === "object" && "url" in b && typeof b.url === "string",
    );
  if (!last || typeof last.url !== "string") return [];
  // Extraer los slugs de la url (ignorando vacíos)
  return last.url.split("/").filter(Boolean);
};

/**
 * Transforms a Tenant to its slug for Typesense indexing
 * Allows filtering pages by tenant using facets
 */
export const transformTenant = async (
  value: Tenant | number | null,
): Promise<string> => {
  if (!value) return "";
  if (typeof value !== "number") {
    return value.slug;
  }
  const payload = await getPayload();
  const tenant = await payload.findByID({ collection: "tenants", id: value });
  return String(tenant?.slug) ?? "";
};
