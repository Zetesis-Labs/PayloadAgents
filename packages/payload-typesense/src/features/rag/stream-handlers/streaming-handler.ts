/**
 * Streaming response handler
 *
 * Handles streaming responses from Typesense conversational search
 */

import { logger } from "../../../core/logging/logger";
import { ChunkSource, SpendingEntry } from "../../../shared/index";
import {
  buildContextText,
  extractSourcesFromResults,
  parseConversationEvent,
} from "../stream-handler";
import { sendSSEEvent } from "../utils/sse-utils";
import { estimateTokensFromText, resolveDocumentType } from "./utils";

/**
 * Default implementation for handling streaming responses
 */
export async function defaultHandleStreamingResponse(
  response: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<{
  fullAssistantMessage: string;
  conversationId: string | null;
  sources: ChunkSource[];
  llmSpending: SpendingEntry;
}> {
  logger.debug("Starting streaming response handling");

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sources: ChunkSource[] = [];
  let hasCollectedSources = false;
  let conversationId: string | null = null;
  let contextText = ""; // To estimate LLM tokens
  let fullAssistantMessage = "";

  try {
    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        logger.info("Streaming response completed", {
          totalChunks: chunkCount,
          finalMessageLength: fullAssistantMessage.length,
        });
        break;
      }

      chunkCount++;
      const chunkText = decoder.decode(value, { stream: true });
      buffer += chunkText;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      logger.info("Received chunk from Typesense", {
        chunkNumber: chunkCount,
        chunkSize: chunkText.length,
        linesInChunk: lines.length,
        bufferSize: buffer.length,
        firstLinePreview: lines[0]?.substring(0, 200),
      });

      for (const line of lines) {
        const event = parseConversationEvent(line);
        if (!event) {
          logger.info("Skipping line that could not be parsed", {
            line: line.substring(0, 100),
          });
          continue;
        }

        // Handle [DONE] event
        if (event.raw === "[DONE]") {
          logger.info("[DONE] event received, sending done event to client");
          sendSSEEvent(controller, encoder, { type: "done", data: "" });
          continue;
        }

        // Capture conversation_id
        if (!conversationId && event.conversationId) {
          conversationId = event.conversationId;
          logger.info("Conversation ID captured", { conversationId });
          sendSSEEvent(controller, encoder, {
            type: "conversation_id",
            data: conversationId,
          });
        }

        // Extract sources
        if (!hasCollectedSources && event.results) {
          sources = extractSourcesFromResults(
            event.results,
            resolveDocumentType,
          );
          contextText = buildContextText(event.results);

          if (sources.length > 0) {
            logger.info("Sources extracted and sent", {
              sourceCount: sources.length,
            });
            sendSSEEvent(controller, encoder, {
              type: "sources",
              data: sources,
            });
          }

          hasCollectedSources = true;
        }

        // Stream conversation tokens
        if (event.message) {
          fullAssistantMessage += event.message;
          logger.info("Token received", {
            tokenLength: event.message.length,
            totalMessageLength: fullAssistantMessage.length,
            token: event.message.substring(0, 50),
          });
          sendSSEEvent(controller, encoder, {
            type: "token",
            data: event.message,
          });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Estimate LLM tokens (context + user message + response)
  const llmInputTokens = estimateTokensFromText(contextText);
  const llmOutputTokens = estimateTokensFromText(fullAssistantMessage);

  // Track LLM spending (defaults to a simple model)
  const llmSpending: SpendingEntry = {
    service: "openai_llm",
    model: "gpt-4o-mini",
    tokens: {
      input: llmInputTokens,
      output: llmOutputTokens,
      total: llmInputTokens + llmOutputTokens,
    },
    cost_usd: llmInputTokens * 0.00000015 + llmOutputTokens * 0.0000006, // gpt-4o-mini pricing
    timestamp: new Date().toISOString(),
  };

  logger.info("LLM cost calculated", {
    inputTokens: llmInputTokens,
    outputTokens: llmOutputTokens,
    totalTokens: llmSpending.tokens.total,
    costUsd: llmSpending.cost_usd,
  });

  return {
    fullAssistantMessage,
    conversationId,
    sources,
    llmSpending,
  };
}
