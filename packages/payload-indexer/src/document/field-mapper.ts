import type { FieldMapping, PayloadDocument } from "./types";

/**
 * Extended field mapping with backend-specific properties
 * This interface is used internally for field mappings that may have additional properties
 */
interface ExtendedFieldMapping extends FieldMapping {
  type?: string;
  optional?: boolean;
}

/**
 * Extracts a value from a document using dot notation path
 */
const getValueByPath = (obj: unknown, path: string): unknown => {
  if (!obj || typeof obj !== "object") return undefined;

  return path.split(".").reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
};

/**
 * Maps a Payload document to an index document based on field configuration
 *
 * This function handles both base FieldMapping and extended mappings with
 * backend-specific properties like 'type' and 'optional'.
 */
export const mapPayloadDocumentToIndex = async (
  doc: PayloadDocument,
  fields: FieldMapping[],
): Promise<Record<string, unknown>> => {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const sourcePath = field.payloadField || field.name;
    let value = getValueByPath(doc, sourcePath);

    // Cast to extended mapping to check for optional backend-specific properties
    const extField = field as ExtendedFieldMapping;

    // Apply custom transform if provided
    if (field.transform) {
      value = await field.transform(value);
    } else if (extField.type) {
      // Handle missing values (only if type is defined)
      if (value === undefined || value === null) {
        if (extField.optional) continue;
        // Default values based on type
        if (extField.type === "string") value = "";
        else if (extField.type === "string[]") value = [];
        else if (extField.type === "bool") value = false;
        else if (extField.type.startsWith("int") || extField.type === "float")
          value = 0;
      }

      // Type conversion/validation (only if no transform was applied)
      if (extField.type === "string" && typeof value !== "string") {
        if (typeof value === "object" && value !== null) {
          // Try to extract text from rich text or objects
          value = JSON.stringify(value);
        } else {
          value = String(value);
        }
      } else if (extField.type === "string[]" && !Array.isArray(value)) {
        value = [String(value)];
      } else if (extField.type === "bool") {
        value = Boolean(value);
      }
    }

    // Only add the field if we have a value (or if it was explicitly transformed)
    if (value !== undefined) {
      result[field.name] = value;
    }
  }

  return result;
};
