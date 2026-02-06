import OpenAI from "openai";
import { MIN_EMBEDDING_TEXT_LENGTH } from "../../core/config/constants";
import type { Logger } from "../../core/logging/logger";
import type {
  BatchEmbeddingResult,
  EmbeddingProvider,
  EmbeddingResult,
  OpenAIProviderConfig,
} from "../types";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(
    config: OpenAIProviderConfig,
    private logger: Logger,
  ) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult | null> {
    if (!text || text.trim().length < MIN_EMBEDDING_TEXT_LENGTH) {
      return null;
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.trim(),
        dimensions: this.dimensions,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) return null;

      return {
        embedding,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      this.logger.error("OpenAI embedding generation failed", error, {
        model: this.model,
        textLength: text.length,
        textPreview: text.substring(0, 200) + (text.length > 200 ? "..." : ""),
      });
      return null;
    }
  }

  async generateBatchEmbeddings(
    texts: string[],
  ): Promise<BatchEmbeddingResult | null> {
    const validTexts = texts.filter(
      (t) => t && t.trim().length >= MIN_EMBEDDING_TEXT_LENGTH,
    );
    if (validTexts.length === 0) return null;

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: validTexts.map((t) => t.trim()),
        dimensions: this.dimensions,
      });

      const embeddings = response.data.map((d) => d.embedding);

      return {
        embeddings,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      this.logger.error("OpenAI batch embedding generation failed", error, {
        model: this.model,
        count: texts.length,
      });
      return null;
    }
  }
}
