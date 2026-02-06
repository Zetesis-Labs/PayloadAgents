import type { Logger } from "../core/logging/logger";
import { GeminiEmbeddingProvider } from "./providers/gemini-provider";
import { OpenAIEmbeddingProvider } from "./providers/openai-provider";
import type {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingService,
} from "./types";

/**
 * Implementation of the EmbeddingService interface
 */
export class EmbeddingServiceImpl implements EmbeddingService {
  constructor(
    private provider: EmbeddingProvider,
    private logger: Logger,
    private config: EmbeddingProviderConfig,
  ) {}

  async getEmbedding(text: string): Promise<number[] | null> {
    const result = await this.provider.generateEmbedding(text);
    if (!result) return null;
    return result.embedding;
  }

  async getEmbeddingsBatch(texts: string[]): Promise<number[][] | null> {
    const result = await this.provider.generateBatchEmbeddings(texts);
    if (!result) return null;
    return result.embeddings;
  }

  getDimensions(): number {
    return this.config.dimensions!;
  }
}

/**
 * Factory function to create an EmbeddingService from configuration
 */
export function createEmbeddingService(
  config: EmbeddingProviderConfig,
  logger: Logger,
): EmbeddingService {
  let provider: EmbeddingProvider;

  switch (config.type) {
    case "openai":
      provider = new OpenAIEmbeddingProvider(config, logger);
      break;
    case "gemini":
      provider = new GeminiEmbeddingProvider(config, logger);
      break;
    default:
      throw new Error(
        `Unsupported embedding provider: ${(config as any).type}`,
      );
  }

  return new EmbeddingServiceImpl(provider, logger, config);
}
