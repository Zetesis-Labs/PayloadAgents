"""System prompt composition for Agno agents.

Consumers can override `tool_protocol` and `output_format` via
`RuntimeConfig` to change the canned guidance the agent receives,
without forking the lib.
"""

from __future__ import annotations

from agno_agent_builder.sources.types import AgentConfig

DEFAULT_TOOL_PROTOCOL = """\
You retrieve information using ONLY `search_collections`.

ARGUMENT SHAPE (read this before every call):
- `query` (string): 1-2 concept keywords. NEVER put author names or
  meta-words ("opinión", "dice", "piensa", "encuentres") here.
- `collections` (string[]): chunk-collection names to search across.
  Example: `["posts_chunk", "books_chunk"]`.
- `filters` (object): facet filters. Keys are field names, values are
  strings or string arrays. The supported keys are `taxonomy_slugs`,
  `folder_slugs`, `tenant` and `headers`. Example:
  `{ "taxonomy_slugs": "<slug>" }` or `{ "folder_slugs": "<slug>" }`.
- COMMON MISTAKE: do NOT pass `filters: "posts_chunk"`. That is a
  collection name and belongs in `collections: ["posts_chunk"]`.

TAXONOMY SLUGS:
- Use ONLY the slugs declared in <RAG_CONFIG> when present.
- If <RAG_CONFIG> is empty and you need to scope, FIRST call
  `get_taxonomy_tree` to list the slugs that actually exist; then
  pick from that list.
- NEVER invent, guess, or default to a slug that has not appeared
  in <RAG_CONFIG> or the taxonomy tree response.

TWO-PASS WORKFLOW:

Pass 1 — Discovery:
  Call `search_collections` with 1-2 concept keywords (default settings).
  Returns up to 20 hits truncated to 300 chars.
  Pass the taxonomy_slugs from <RAG_CONFIG> in `filters` (object form),
  or omit `filters` entirely if no slugs are configured.

Pass 2 — Expand:
  Call `search_collections` again with the SAME query adding:
    snippet_length: 0
    expand_context: 2
    per_page: 5
  This returns full text with neighboring chunks in one call.

RULES:
- Do NOT answer from truncated snippets. Always do Pass 2 before answering.
- If Pass 1 returns < 3 hits, shorten query to 1 keyword or retry with mode: "lexical".
- If no results, reformulate once before saying you have no information.
- Cite the document title for every claim.
- Plan your searches carefully to minimize tool calls."""


DEFAULT_OUTPUT_FORMAT = """\
ALWAYS format responses in Markdown. This is mandatory, not optional.

Structure:
- Use ## and ### headings to organize sections.
- Use **bold** for key concepts, names, and terms.
- Use numbered lists for sequential arguments.
- Use bullet lists for non-sequential points.
- Use > blockquotes when quoting the author's exact words.
- Keep paragraphs short (3-4 sentences max).
- Put the source document title in **bold** after each claim or quote."""


def compose_instructions(
    cfg: AgentConfig,
    *,
    tool_protocol: str | None = None,
    output_format: str | None = None,
) -> str:
    """Build the full system prompt from a normalized agent config.

    Structure (outermost → innermost):
      <PERSONA>        — who you are
      <RAG_CONFIG>     — scoping: taxonomy slugs, collections
      <TOOL_PROTOCOL>  — how to call tools (two-pass workflow)
      <OUTPUT_FORMAT>  — how to format the final answer
    """
    sections: list[str] = []

    persona = (cfg.instructions_extra or "").strip()
    if persona:
        sections.append(f"<PERSONA>\n{persona}\n</PERSONA>")

    rag_parts: list[str] = []
    if cfg.taxonomy_slugs:
        rag_parts.append(f"taxonomy_slugs: {','.join(cfg.taxonomy_slugs)}")
    if cfg.folder_slugs:
        rag_parts.append(f"folder_slugs: {','.join(cfg.folder_slugs)}")
    if cfg.search_collections:
        rag_parts.append(f"collections: {','.join(cfg.search_collections)}")
    if rag_parts:
        sections.append(f"<RAG_CONFIG>\n{chr(10).join(rag_parts)}\n</RAG_CONFIG>")

    profiles_block = _compose_retrieval_profiles(cfg)
    if profiles_block:
        sections.append(profiles_block)

    limit_line = f"\nMax {cfg.tool_call_limit} tool calls per turn." if cfg.tool_call_limit else ""
    sections.append(
        f"<TOOL_PROTOCOL>\n{tool_protocol or DEFAULT_TOOL_PROTOCOL}{limit_line}\n</TOOL_PROTOCOL>"
    )
    sections.append(f"<OUTPUT_FORMAT>\n{output_format or DEFAULT_OUTPUT_FORMAT}\n</OUTPUT_FORMAT>")

    return "\n\n".join(sections)


def _compose_retrieval_profiles(cfg: AgentConfig) -> str | None:
    """When the agent exposes 2+ retrieval profiles (lentes), tell the LLM it
    MUST pick one per search. With 0-1 profiles there's nothing to choose, so
    the block is omitted and the MCP profile-selection guard stays off.
    """
    profiles = cfg.retrieval_profiles
    if len(profiles) < 2:
        return None
    lines = [
        f"- {p.slug}: {p.name}" + (f" — {p.description}" if p.description else "") for p in profiles
    ]
    catalog = "\n".join(lines)
    return (
        "<RETRIEVAL_PROFILES>\n"
        "You have multiple retrieval profiles (lentes). Each biases search toward a\n"
        "different register or perspective. You MUST select one for every retrieval:\n"
        f"{catalog}\n\n"
        'Pass `retrieval_profile: "<slug>"` in EVERY search_collections call (and in\n'
        "each group of compare_perspectives). Pick the profile that best fits the\n"
        "question; when in doubt call list_retrieval_profiles first. Searching without\n"
        "a profile is rejected. To compare registers, run compare_perspectives with a\n"
        "different retrieval_profile per group.\n"
        "</RETRIEVAL_PROFILES>"
    )
