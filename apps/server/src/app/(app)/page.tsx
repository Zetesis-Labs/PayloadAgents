import { getPayload } from 'payload'
import config from '@/payload.config'
import Link from 'next/link'
import { ZetesisLogo } from '@/components/zetesis-logo'
import { ApiTokensLink } from './api-tokens-link'

const PER_PAGE = 10

const PACKAGES = [
  { name: 'payload-indexer', desc: 'Collection sync & embedding pipeline for Typesense' },
  { name: 'payload-typesense', desc: 'Typesense adapter, search endpoints & RAG chat' },
  { name: 'payload-taxonomies', desc: 'Hierarchical taxonomies with breadcrumb navigation' },
  { name: 'payload-lexical-blocks-builder', desc: 'Lexical editor blocks builder & renderer' },
  { name: 'chat-agent', desc: 'Floating chat UI with streaming, sessions & agent selection' },
]

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams
  const currentPage = Math.max(1, Number(pageParam) || 1)
  const payload = await getPayload({ config })
  const { docs: posts, totalPages } = await payload.find({
    collection: 'posts',
    sort: '-publishedAt',
    limit: PER_PAGE,
    page: currentPage,
    depth: 1,
  })

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      {/* Hero */}
      <header className="mb-16 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          PayloadAgents
        </h1>
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="text-xl text-muted-foreground">by</span>
          <ZetesisLogo className="h-9 w-auto" />
        </div>
        <p className="mt-3 text-lg text-muted-foreground">
          Open-source Payload CMS plugins for search, RAG & AI chat
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/admin"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Admin Panel
          </Link>
          <ApiTokensLink />

          <a
            href="https://github.com/Zetesis-Labs/PayloadAgents"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* About */}
      <section className="mb-16 rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 text-xl font-semibold">About this project</h2>
        <p className="leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Payload Agents</strong> is a collection of open-source
          plugins extracted from{' '}
          <a
            href="https://zetesis.es"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:opacity-80"
          >
            Zetesis Portal
          </a>
          , a multi-tenant Payload CMS platform. These packages provide semantic search,
          RAG-powered chat, taxonomy management, and content rendering &mdash; all designed to work
          together or independently. This playground is the development environment where we build
          and test them.
        </p>
      </section>

      {/* Posts */}
      <section className="mb-16">
        <h2 className="mb-4 text-xl font-semibold">Posts</h2>
        {posts.length === 0 ? (
          <p className="text-muted-foreground">No posts published yet.</p>
        ) : (
          <div className="grid gap-4">
            {posts.map((post) => {
              const categories = Array.isArray(post.categories)
                ? (post.categories.filter(
                    (c) => typeof c === 'object' && c !== null,
                  ) as unknown as Record<string, unknown>[])
                : []

              return (
                <Link
                  key={post.id}
                  href={`/posts/${post.slug}`}
                  className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <h3 className="text-lg font-semibold group-hover:text-primary">{post.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {post.publishedAt && (
                      <time className="text-sm text-muted-foreground">
                        {new Date(post.publishedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                    {categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map((cat) => (
                          <span
                            key={String(cat.id)}
                            className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {String(cat.title ?? cat.name ?? cat.id)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-4">
            {currentPage > 1 && (
              <Link
                href={`/?page=${currentPage - 1}`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-card"
              >
                Previous
              </Link>
            )}
            <span className="text-sm text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            {currentPage < totalPages && (
              <Link
                href={`/?page=${currentPage + 1}`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-card"
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>

      {/* Packages */}
      <section className="mb-16">
        <h2 className="mb-4 text-xl font-semibold">Packages</h2>
        <div className="grid gap-3">
          {PACKAGES.map((pkg) => (
            <a
              key={pkg.name}
              href={`https://github.com/Zetesis-Labs/PayloadAgents/tree/main/packages/${pkg.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span className="font-mono text-sm text-primary">@zetesis/{pkg.name}</span>
              <p className="mt-1 text-sm text-muted-foreground">{pkg.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-16 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        <p>
          Built by{' '}
          <a
            href="https://zetesis.es"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:opacity-80"
          >
            Zetesis
          </a>{' '}
          &middot; MIT License
        </p>
      </footer>
    </main>
  )
}
