/**
 * Built-in defaults used when the consumer doesn't provide overrides.
 *
 * These strings are intentionally generic so the package is usable out of the
 * box. Consumers with rich, domain-specific corpora (like Zetesis Portal)
 * should override them via `server.instructions` and `resources.guide`.
 */

export const DEFAULT_INSTRUCTIONS = `MCP search server over Typesense-indexed content with taxonomy enrichment.

WORKFLOW:
1. Read \`taxonomy://tree\` and \`stats://collections\` to understand structure and volume.
2. BROWSE structure: \`get_post_summaries\` (list by author/topic) or \`get_book_toc\` (book chapter structure), if available.
3. SEARCH by concept: \`search_collections\` for idea/quote queries.
4. READ content: use \`search_collections\` with \`snippet_length: 0\` and \`expand_context: 2\` for full text, or \`get_chunks_by_ids\` for specific chunks.

SEARCH RULES:
- Query by CONCEPT. Do NOT put author names or meta-words in the query — scope them via \`filters.taxonomy_slugs\` instead.
- Use \`filters.folder_slugs\` to scope by folder. Slugs follow the breadcrumb chain (root → leaf), so filtering by an ancestor's slug selects everything below it.
- Lexical mode AND-joins terms. 1-2 concept words yield the best recall. Shorter query = more results.
- In semantic/hybrid, vector recall is fixed (top 100 neighbors); \`per_page\` only paginates the page you see.
- \`total_found\` is only reliable in \`mode: "lexical"\`.

RETRIEVAL PROFILES AND SCOPE:
- When \`list_retrieval_profiles\` returns profiles, the \`retrieval_profile\` you pass sets the HARD scope of the search. \`filters\` can only NARROW inside it, never widen it.
- Slugs outside the profile are dropped and reported in \`scope_notice\`; if the whole filter falls outside, you get zero hits. To reach other content, switch \`retrieval_profile\` — not \`filters\`.
- Read tools (\`get_chunks_by_ids\`, \`summarize_document\`, \`extract_claims\`) and metadata tools (\`get_taxonomy_tree\`, \`get_filter_criteria\`) are scoped the same way. Pass the SAME \`retrieval_profile\` you searched with — ids found under one profile are not readable under another; omitting it falls back to your default profile.
- \`filters.tenant\` is ignored: the tenant comes from your credentials.

PARAMETER TYPES:
- \`filters\` MUST be a JSON object, not a stringified JSON.
- \`taxonomy_slugs\` and \`folder_slugs\` accept a string OR a string array.
- \`per_page\`, \`page\`, \`snippet_length\` are numbers, not strings.

Read \`guide://search\` for deeper guidance.`

export const DEFAULT_GUIDE = `# MCP Search Server — Agent Guide

## How to search effectively

- Search by **CONCEPT**, not by author name or meta-words. Indexed content is direct text — authors don't name themselves.
- Use \`taxonomy_slugs\` **FILTERS** to scope by author/topic instead of putting the name in the query:
  \`{ "filters": { "taxonomy_slugs": "some-slug" }, "query": "core concept" }\`
- Use \`folder_slugs\` **FILTERS** to scope by folder. The slug chain mirrors the folder breadcrumb (root → leaf), so filtering by an ancestor folder's slug selects everything below it.
- Use the \`headers\` filter to search within a specific book section.
- Do NOT add meta-words like "opinion", "thinks", "says", "believes" — they are not in the content.

## Filters vs retrieval profiles

If your credentials expose retrieval profiles, the chosen \`retrieval_profile\` is the hard boundary of what you can read and \`filters\` only narrow within it:

- Different author/perspective → switch \`retrieval_profile\`
- Sub-topic, folder or section inside your profile → add \`filters\`
- Different tenant → not possible, it comes from your credentials

Out-of-scope slugs are dropped and explained in \`scope_notice\`. Zero hits with a \`scope_notice\` means scope enforcement, not missing content — do not retry the same filter with a shorter query.

Reads inherit the same boundary: \`get_chunks_by_ids\`, \`summarize_document\` and \`extract_claims\` accept \`retrieval_profile\` and only return chunks inside that profile's scope. Always pass the profile you searched with; without it the read runs under your default profile and chunks found under another profile come back missing (with a \`scope_notice\`).

With no profiles attached, \`filters\` are unrestricted and this section does not apply.

## Query length and lexical AND

**Lexical mode AND-joins terms.** A query like \`"topic A topic B topic C"\` requires chunks to contain ALL three words. Adding words narrows results aggressively. For broad recall:

- Use **1–2 concept words** in the query
- Push everything else into \`filters\` (author, topic, headers)
- Hybrid mode inherits the lexical AND constraint

## total_found and vector recall

In semantic and hybrid modes the vector search returns a fixed top-100 nearest neighbors regardless of \`per_page\`, so \`per_page\` only paginates the page you receive — it does not cap recall. However, \`total_found\` in semantic/hybrid reflects that vector cap, **not the true corpus size**. To get a true count for a single concept, query with \`mode: "lexical"\`.

## Sanity-checking suspicious results

If a search returns suspiciously few results:

1. **Try \`mode: "lexical"\`** with a single concept word. Lexical's \`total_found\` IS reliable.
2. **Shorten the query.**
3. **Check the filter.** A typo in \`taxonomy_slugs\` silently returns zero.
4. **Don't conclude "no data" from one query.** Reformulate at least once before giving up.

## Recommended workflow

1. Read \`taxonomy://tree\` — understand the category hierarchy
2. Read \`stats://collections\` — understand data volume
3. Use \`get_post_summaries\` / \`get_book_toc\` to browse content structure
4. Use \`search_collections\` for concept-based searches with taxonomy filters
5. Use \`search_collections\` with \`snippet_length: 0\` and \`expand_context: 2\` to read full content of hits

## Parameter shapes (common pitfalls)

Some MCP clients silently coerce structured parameters into strings. Always pass:

- \`filters\` as a **JSON object**, never as a stringified JSON.
- \`taxonomy_slugs\` and \`folder_slugs\` as a string OR string array.
- \`per_page\`, \`page\`, \`snippet_length\` as **numbers**, not strings.
- \`collections\` as a string array.

## LLM-powered synthesis tools

If registered (\`features.llmSampling\` not disabled), the server exposes three tools that use MCP sampling to ask the client's LLM to synthesize results: \`summarize_document\`, \`extract_claims\`, \`synthesize_comparison\`. These are slow (5–40 s) and consume tokens from the client's LLM budget.

### Citation verification

Every \`chunk_id\` the model returns is validated server-side against the chunks passed in that sampling call. Citations come back with \`verified: true | false\`:

- \`verified: true\` — the id exists in the passed chunks; safe to quote.
- \`verified: false\` — the model hallucinated the id. **Do not quote as a citation.**

### Fallback when the client doesn't support sampling

If your MCP client does not advertise the \`sampling\` capability, synthesis tools return a \`sampling_not_supported\` error with a \`fallback\` hint pointing to a retrieval-only tool. Follow the fallback and synthesize in your own context.

## Response format: TOON

All responses use **TOON** (Token-Oriented Object Notation) instead of JSON by default — ~40% fewer tokens. Pass \`format: "json"\` for standard JSON.
`
