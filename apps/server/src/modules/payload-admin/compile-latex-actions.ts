'use server'

import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface CompileResult {
  success: boolean
  pdf?: string // base64
  log: string
  error?: string
}

const COMPILE_TIMEOUT_MS = 15_000
const MAX_AUTO_INSTALL_RETRIES = 3

// Map common .sty/.cls files to their Alpine texmf-dist-* package.
// Ordered from smallest to largest to minimise unnecessary downloads.
const STY_TO_APK: Record<string, string> = {
  // texmf-dist-langspanish (~4 MiB)
  'spanish.ldf': 'texmf-dist-langspanish',

  // texmf-dist-latexrecommended (~38 MiB)
  'geometry.sty': 'texmf-dist-latexrecommended',
  'hyperref.sty': 'texmf-dist-latexrecommended',
  'xcolor.sty': 'texmf-dist-latexrecommended',
  'setspace.sty': 'texmf-dist-latexrecommended',
  'etoolbox.sty': 'texmf-dist-latexrecommended',
  'bookmark.sty': 'texmf-dist-latexrecommended',
  'footmisc.sty': 'texmf-dist-latexrecommended',
  'url.sty': 'texmf-dist-latexrecommended',
  'textcomp.sty': 'texmf-dist-latexrecommended',
  'fontenc.sty': 'texmf-dist-latexrecommended',
  'inputenc.sty': 'texmf-dist-latexrecommended',
  'cmap.sty': 'texmf-dist-latexrecommended',
  'float.sty': 'texmf-dist-latexrecommended',
  'multicol.sty': 'texmf-dist-latexrecommended',

  // texmf-dist-plaingeneric (~43 MiB)
  'iftex.sty': 'texmf-dist-plaingeneric',

  // texmf-dist-latexextra (~180 MiB)
  'fancyhdr.sty': 'texmf-dist-latexextra',
  'titlesec.sty': 'texmf-dist-latexextra',
  'enumitem.sty': 'texmf-dist-latexextra',
  'parskip.sty': 'texmf-dist-latexextra',
  'tocloft.sty': 'texmf-dist-latexextra',
  'csquotes.sty': 'texmf-dist-latexextra',
  'mdframed.sty': 'texmf-dist-latexextra',
  'tcolorbox.sty': 'texmf-dist-latexextra',
  'adjustbox.sty': 'texmf-dist-latexextra',
  'caption.sty': 'texmf-dist-latexextra',
  'subcaption.sty': 'texmf-dist-latexextra',
  'pdfpages.sty': 'texmf-dist-latexextra',
  'lastpage.sty': 'texmf-dist-latexextra',
  'multirow.sty': 'texmf-dist-latexextra',
  'longtable.sty': 'texmf-dist-latexextra',
  'tabularx.sty': 'texmf-dist-latexextra',
  'booktabs.sty': 'texmf-dist-latexextra',
  'ragged2e.sty': 'texmf-dist-latexextra',
  'microtype.sty': 'texmf-dist-latexextra',
  'placeins.sty': 'texmf-dist-latexextra',
  'lipsum.sty': 'texmf-dist-latexextra',
  'blindtext.sty': 'texmf-dist-latexextra',

  // texmf-dist-fontsrecommended (~165 MiB)
  'lmodern.sty': 'texmf-dist-fontsrecommended',
  'fontspec.sty': 'texmf-dist-fontsrecommended',

  // texmf-dist-humanities (~8 MiB)
  'biblatex.sty': 'texmf-dist-humanities',

  // texmf-dist-mathscience
  'amsmath.sty': 'texmf-dist-mathscience',
  'amssymb.sty': 'texmf-dist-mathscience',
  'mathtools.sty': 'texmf-dist-mathscience',
  'amsthm.sty': 'texmf-dist-mathscience',
  'siunitx.sty': 'texmf-dist-mathscience',

  // texmf-dist-pictures
  'tikz.sty': 'texmf-dist-pictures',
  'pgfplots.sty': 'texmf-dist-pictures',

  // texmf-dist-langeuropean
  'babel-french.sty': 'texmf-dist-langeuropean',
}

// Fallback: when missing file is not in the map, try these in order
const FALLBACK_PACKAGES = [
  'texmf-dist-latexrecommended',
  'texmf-dist-latexextra',
  'texmf-dist-fontsrecommended',
  'texmf-dist-plaingeneric',
  'texmf-dist-langspanish',
  'texmf-dist-humanities',
  'texmf-dist-mathscience',
  'texmf-dist-pictures',
]

/** Parse missing .sty/.cls files from a pdflatex log */
function parseMissingFiles(log: string): string[] {
  const results: string[] = []
  for (const m of log.matchAll(/! LaTeX Error: File `([^']+)' not found/g)) {
    if (m[1]) results.push(m[1])
  }
  // Also catch babel language errors like "Unknown option `spanish'"
  for (const m of log.matchAll(
    /Package babel Error.*Unknown option `([^']+)'/g,
  )) {
    if (m[1]) results.push(`${m[1]}.ldf`)
  }
  return [...new Set(results)]
}

/** Try to install an Alpine package. Returns true on success. */
async function tryApkInstall(pkg: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'apk',
      ['add', '--no-cache', pkg],
      { timeout: 60_000 },
      (error) => resolve(!error),
    )
  })
}

/** Run pdflatex on a .tex file and return the log + whether a PDF was produced */
async function runPdflatex(tmpDir: string): Promise<{ pdf: boolean; log: string }> {
  const args = [
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-no-shell-escape',
    `-output-directory=${tmpDir}`,
    'main.tex',
  ]

  await new Promise<void>((resolve, reject) => {
    execFile(
      'pdflatex',
      args,
      { cwd: tmpDir, timeout: COMPILE_TIMEOUT_MS },
      (error) => {
        if (error && !('code' in error && typeof error.code === 'number')) {
          reject(error)
        } else {
          resolve()
        }
      },
    )
  })

  let log = ''
  try {
    log = await readFile(path.join(tmpDir, 'main.log'), 'utf-8')
  } catch {
    // log file may not exist if pdflatex crashed early
  }

  let pdf = false
  try {
    await access(path.join(tmpDir, 'main.pdf'))
    pdf = true
  } catch {
    // PDF not generated
  }

  return { pdf, log }
}

export async function compileLatex(latex: string): Promise<CompileResult> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'latex-'))

  try {
    await writeFile(path.join(tmpDir, 'main.tex'), latex, 'utf-8')

    let result = await runPdflatex(tmpDir)
    const installedPackages = new Set<string>()
    let retries = 0

    // Auto-install loop: detect missing packages, install, retry
    while (!result.pdf && retries < MAX_AUTO_INSTALL_RETRIES) {
      const missing = parseMissingFiles(result.log)
      if (missing.length === 0) break

      // Determine which Alpine packages to install
      const toInstall = new Set<string>()
      let hasUnknown = false
      for (const file of missing) {
        const pkg = STY_TO_APK[file]
        if (pkg && !installedPackages.has(pkg)) {
          toInstall.add(pkg)
        } else if (!pkg) {
          hasUnknown = true
        }
      }

      // If all missing files are unknown, try fallback packages
      if (toInstall.size === 0 && hasUnknown) {
        const fallback = FALLBACK_PACKAGES.find((p) => !installedPackages.has(p))
        if (fallback) toInstall.add(fallback)
      }

      if (toInstall.size === 0) break

      let anyInstalled = false
      for (const pkg of toInstall) {
        installedPackages.add(pkg)
        const ok = await tryApkInstall(pkg)
        if (ok) anyInstalled = true
      }

      if (!anyInstalled) break // apk failed (likely not root) — stop retrying

      retries++
      result = await runPdflatex(tmpDir)
    }

    let pdf: string | undefined
    if (result.pdf) {
      const pdfBuffer = await readFile(path.join(tmpDir, 'main.pdf'))
      pdf = pdfBuffer.toString('base64')
    }

    return {
      success: !!pdf,
      pdf,
      log: result.log,
      error: pdf
        ? undefined
        : 'pdflatex no generó el PDF. Revisa el log de compilación.',
    }
  } catch (err) {
    return {
      success: false,
      log: '',
      error: err instanceof Error ? err.message : 'Error al ejecutar pdflatex.',
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
