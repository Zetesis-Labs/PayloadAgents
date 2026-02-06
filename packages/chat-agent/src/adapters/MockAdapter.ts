import {
  ChatAdapter,
  Message,
  PublicAgentInfo,
  SendMessageContext,
  SessionSummary,
  StreamCallbacks,
} from "./ChatAdapter";

export class MockAdapter implements ChatAdapter {
  private sessions: Map<
    string,
    { id: string; title: string; messages: Message[] }
  > = new Map();

  constructor() {
    // Initial mock data
    this.sessions.set("mock-session-1", {
      id: "mock-session-1",
      title: "Mock Conversation",
      messages: [
        {
          role: "assistant",
          content: "Hello! I am a mock assistant. How can I help you?",
          timestamp: new Date(Date.now() - 1000000),
        },
      ],
    });
  }

  async sendMessage(
    message: string,
    context: SendMessageContext,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const convoId = context.conversationId || `mock-session-${Date.now()}`;

    // Simulate initial delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (context.conversationId !== convoId) {
      callbacks.onConversationId?.(convoId);
    }

    if (!context.conversationId) {
      // Create new session if null
      this.sessions.set(convoId, {
        id: convoId,
        title: "New Mock Chat",
        messages: [],
      });
    }

    // Simulate streaming
    const responseText = `This is a mock response to: "${message}". \n\nI am simulating a stream of tokens.`;
    const tokens = responseText.split(/(?=[\s\S])/); // Split by chars for smooth effect

    for (const token of tokens) {
      if (signal?.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
      callbacks.onToken?.(token);
    }

    // Simulate sources
    callbacks.onSources?.([
      {
        id: "mock-source-1",
        title: "Mock Source Article",
        slug: "mock-source-article",
        type: "article",
        chunkIndex: 0,
        relevanceScore: 0.95,
        content: "Mock content for the source.",
      },
    ]);

    // Mock usage
    callbacks.onUsage?.({
      daily_limit: 1000,
      daily_used: 150,
      daily_remaining: 850,
      reset_at: new Date(Date.now() + 86400000).toISOString(),
    });

    callbacks.onDone?.();
  }

  async getActiveSession(): Promise<{
    conversationId: string;
    messages: Message[];
  } | null> {
    // Return last session or null
    if (this.sessions.size > 0) {
      const last = Array.from(this.sessions.values()).pop();
      return last ? { conversationId: last.id, messages: last.messages } : null;
    }
    return null;
  }

  async getHistory(): Promise<SessionSummary[]> {
    return Array.from(this.sessions.values()).map((s) => ({
      conversation_id: s.id,
      title: s.title,
      last_activity: new Date().toISOString(), // Mock
      status: "active",
    }));
  }

  async loadSession(
    id: string,
  ): Promise<{ conversationId: string; messages: Message[] } | null> {
    const session = this.sessions.get(id);
    return session
      ? { conversationId: session.id, messages: session.messages }
      : null;
  }

  async renameSession(id: string, newTitle: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (session) {
      session.title = newTitle;
      return true;
    }
    return false;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async getAgents(): Promise<PublicAgentInfo[]> {
    return [
      { slug: "default-mock-agent", name: "Mock Agent" },
      { slug: "advanced-mock-agent", name: "Advanced Mock Agent" },
    ];
  }
}
