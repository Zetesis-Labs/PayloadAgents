/**
 * Server-Sent Events (SSE) utilities
 *
 * Provides utilities for formatting and sending SSE events
 */

import type { SSEEvent } from '../../../shared'

/**
 * Helper to create an SSE event string
 *
 * @param event - SSE event object
 * @returns Formatted SSE event string
 */
export function formatSSEEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/**
 * Helper to send an SSE event through a controller
 *
 * @param controller - ReadableStreamDefaultController
 * @param encoder - TextEncoder instance
 * @param event - SSE event to send
 */
export function sendSSEEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: SSEEvent
): void {
  const data = formatSSEEvent(event)
  controller.enqueue(encoder.encode(data))
}
