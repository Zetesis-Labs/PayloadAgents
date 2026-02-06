"use client";

// Client-side React components and context
export { ChatProvider, useChat } from "./components/chat-context";
export { default as FloatingChatManager } from "./components/FloatingChatManager";

// assistant-ui components
export {
  AssistantMessage,
  Composer,
  MarkdownText,
  Thread,
  UserMessage,
} from "./components/assistant-ui/index";

// Runtime adapter
export { useAssistantRuntime } from "./hooks/useAssistantRuntime";

// Adapters
export type {
  ChatAdapter,
  Message,
  SessionSummary,
  Source,
  StreamCallbacks,
} from "./adapters/ChatAdapter";
export { MockAdapter } from "./adapters/MockAdapter";
export { NexoPayloadChatAdapter } from "./adapters/NexoPayloadChatAdapter";
