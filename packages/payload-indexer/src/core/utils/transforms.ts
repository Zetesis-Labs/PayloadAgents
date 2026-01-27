import { convertLexicalToMarkdown, editorConfigFactory } from '@payloadcms/richtext-lexical';
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical';
import type { SanitizedConfig } from 'payload';
import OpenAI from 'openai';

/**
 * Recursively extracts plain text from Lexical nodes
 * Used as a fallback when proper Lexical conversion is not available
 */
function extractTextFromLexicalNodes(nodes: any[]): string {
  if (!Array.isArray(nodes)) return '';

  const textParts: string[] = [];

  for (const node of nodes) {
    if (!node) continue;

    // Text node
    if (node.type === 'text' && typeof node.text === 'string') {
      textParts.push(node.text);
    }
    // Linebreak node
    else if (node.type === 'linebreak') {
      textParts.push('\n');
    }
    // Link node - extract text and URL
    else if (node.type === 'link' && node.children) {
      const linkText = extractTextFromLexicalNodes(node.children);
      const url = node.fields?.url || node.url || '';
      if (url && linkText) {
        textParts.push(`[${linkText}](${url})`);
      } else {
        textParts.push(linkText);
      }
    }
    // Heading nodes - add markdown heading prefix
    else if (node.type === 'heading' && node.children) {
      const level = parseInt(node.tag?.replace('h', '') || '1', 10);
      const prefix = '#'.repeat(Math.min(level, 6)) + ' ';
      textParts.push(prefix + extractTextFromLexicalNodes(node.children) + '\n\n');
    }
    // List items
    else if (node.type === 'listitem' && node.children) {
      textParts.push('- ' + extractTextFromLexicalNodes(node.children) + '\n');
    }
    // Quote blocks
    else if (node.type === 'quote' && node.children) {
      const quoteText = extractTextFromLexicalNodes(node.children);
      textParts.push('> ' + quoteText.replace(/\n/g, '\n> ') + '\n\n');
    }
    // Paragraph and other block nodes
    else if (node.children) {
      textParts.push(extractTextFromLexicalNodes(node.children));
      // Add paragraph break for block-level elements
      if (['paragraph', 'heading', 'quote', 'list'].includes(node.type)) {
        textParts.push('\n\n');
      }
    }
  }

  return textParts.join('');
}

/**
 * Simple extraction of text from Lexical structure
 * Falls back to this when proper conversion fails
 */
function simpleLexicalToText(value: SerializedEditorState): string {
  try {
    const root = value?.root;
    if (!root || !root.children) return '';

    const text = extractTextFromLexicalNodes(root.children);
    // Clean up excessive whitespace
    return text.replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '';
  }
}

/**
 * Transforms Lexical editor state to Markdown
 * @param value - The serialized editor state
 * @param config - Optional Payload config. If provided, it will be used to generate the editor config.
 */
export const transformLexicalToMarkdown = async (
  value?: SerializedEditorState | null,
  config?: SanitizedConfig
): Promise<string> => {
  if (!value) {
    return '';
  }

  // Check if we have a valid config with collections
  const hasValidConfig = config &&
    typeof config === 'object' &&
    'collections' in config &&
    Array.isArray(config.collections);

  if (config && hasValidConfig) {
    try {
      const editorConfig = await editorConfigFactory.default({
        config
      });

      const result = await convertLexicalToMarkdown({
        data: value,
        editorConfig
      });
      return result;
    } catch (error) {
      console.warn('Error in Lexical to markdown conversion, falling back to simple extraction:', error);
    }
  }

  // Fallback to simple text extraction
  return simpleLexicalToText(value);
};

/**
 * Configuration for summarize transforms
 */
export interface SummarizeConfig {
  /** Minimum characters before summarization is triggered */
  minCharacters: number;
  /** OpenAI API key. If not provided, uses OPENAI_API_KEY env variable */
  apiKey?: string;
  /** Model to use for summarization. Defaults to 'gpt-4o-mini' */
  model?: string;
  /** Maximum tokens for the summary output. Defaults to 2000 */
  maxTokens?: number;
  /** Maximum input characters to send to OpenAI. Defaults to 500000 (~125k tokens). 
   * Text exceeding this will be truncated before summarization to avoid rate limits. */
  maxInputCharacters?: number;
  /** Custom system prompt for summarization */
  systemPrompt?: string;
}

/** @deprecated Use SummarizeConfig instead */
export type SummarizeLexicalConfig = SummarizeConfig;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that summarizes long texts while preserving the key information, main arguments, and important details.
Create a comprehensive summary that captures the essence of the content.
Maintain the original language of the text.
Focus on preserving factual information, key concepts, and the author's main points.
The summary should be detailed enough to be useful for semantic search and understanding the document's content.`;

/**
 * Core summarization logic shared between transforms.
 * Summarizes text using OpenAI if it exceeds the minimum character limit.
 */
const summarizeText = async (
  text: string,
  config: {
    minCharacters: number;
    maxInputCharacters: number;
    client: OpenAI;
    model: string;
    maxTokens: number;
    systemPrompt: string;
    logPrefix: string;
  }
): Promise<string> => {
  const { minCharacters, maxInputCharacters, client, model, maxTokens, systemPrompt, logPrefix } = config;

  if (!text) {
    return '';
  }

  // If under the limit, return as-is
  if (text.length <= minCharacters) {
    return text;
  }

  // Truncate if exceeds max input to avoid rate limits
  let inputText = text;
  if (text.length > maxInputCharacters) {
    console.log(`[${logPrefix}] Text (${text.length} chars) exceeds maxInputCharacters (${maxInputCharacters}), truncating...`);
    inputText = text.substring(0, maxInputCharacters);
  }

  // Summarize using OpenAI
  try {
    console.log(`[${logPrefix}] Text exceeds ${minCharacters} chars (${inputText.length}), summarizing with ${model}...`);

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please summarize the following text:\n\n${inputText}` }
      ]
    });

    const summary = response.choices[0]?.message?.content || '';

    console.log(`[${logPrefix}] Summarized from ${text.length} to ${summary.length} chars`);

    return summary;
  } catch (error) {
    console.error(`[${logPrefix}] Error summarizing text:`, error);
    // On error, truncate to avoid embedding failures
    return text.substring(0, minCharacters);
  }
};

/**
 * Creates a configured OpenAI client and extracts config with defaults
 */
const createSummarizeContext = (config: SummarizeConfig) => {
  const {
    minCharacters,
    apiKey = process.env.OPENAI_API_KEY,
    model = 'gpt-4o-mini',
    maxTokens = 2000,
    maxInputCharacters = 500000, // ~125k tokens, safe for most models
    systemPrompt = DEFAULT_SYSTEM_PROMPT
  } = config;

  if (!apiKey) {
    throw new Error('OpenAI API key is required for summarization. Provide it in config or set OPENAI_API_KEY env variable.');
  }

  const client = new OpenAI({ apiKey });

  return { minCharacters, maxInputCharacters, client, model, maxTokens, systemPrompt };
};

/**
 * Creates a transform function that summarizes plain text if too long.
 * Uses OpenAI to generate a summary when the content exceeds minCharacters.
 *
 * @param config - Configuration for summarization
 * @returns A transform function that can be used in field configurations
 *
 * @example
 * ```typescript
 * const transform = createSummarizeTransform({
 *   minCharacters: 30000,
 *   model: 'gpt-4o-mini'
 * });
 *
 * // Use in embedding config for plain text fields
 * embedding: {
 *   fields: [{ field: 'description', transform }],
 * }
 * ```
 */
export const createSummarizeTransform = (config: SummarizeConfig) => {
  const ctx = createSummarizeContext(config);

  return async (value?: string | null): Promise<string> => {
    return summarizeText(value || '', {
      ...ctx,
      logPrefix: 'summarize'
    });
  };
};

/**
 * Creates a transform function that converts Lexical to Markdown and summarizes if too long.
 * Uses OpenAI to generate a summary when the content exceeds minCharacters.
 *
 * @param config - Configuration for summarization
 * @param payloadConfig - Payload config for Lexical transformation
 * @returns A transform function that can be used in field configurations
 *
 * @example
 * ```typescript
 * const transform = createSummarizeLexicalTransform({
 *   minCharacters: 30000,
 *   model: 'gpt-4o-mini'
 * }, payloadConfig);
 *
 * // Use in embedding config
 * embedding: {
 *   fields: [{ field: 'content', transform }],
 * }
 * ```
 */
export const createSummarizeLexicalTransform = (
  config: SummarizeConfig,
  payloadConfig?: SanitizedConfig
) => {
  const ctx = createSummarizeContext(config);

  return async (value?: SerializedEditorState | null): Promise<string> => {
    // First, transform Lexical to Markdown
    const markdown = await transformLexicalToMarkdown(value, payloadConfig);

    // Then apply summarization
    return summarizeText(markdown, {
      ...ctx,
      logPrefix: 'summarize-lexical'
    });
  };
};
