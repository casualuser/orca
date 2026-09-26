import { describe, expect, it } from 'vitest'
import { markdownDocumentFromFilePath } from './markdown-documents'

describe('markdownDocumentFromFilePath', () => {
  it('keeps in-root path segments that merely start with parent traversal text', () => {
    expect(markdownDocumentFromFilePath('/workspace', '/workspace/..notes/file.md')).toMatchObject({
      filePath: '/workspace/..notes/file.md',
      relativePath: '..notes/file.md',
      basename: 'file.md',
      name: 'file'
    })
  })

  it('treats actual parent traversal as outside the root', () => {
    expect(
      markdownDocumentFromFilePath('/workspace', '/workspace-other/file.md', {
        outsideRootRelativePath: 'basename'
      })
    ).toMatchObject({
      filePath: '/workspace-other/file.md',
      relativePath: 'file.md',
      basename: 'file.md',
      name: 'file'
    })
  })
})

describe('listMarkdownDocuments', () => {
  it('indexes documents inside .tasks and safe in-workspace symlinks, ignoring external symlinks', async () => {
    const { mkdtemp, mkdir, writeFile, symlink, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { listMarkdownDocuments } = await import('./markdown-documents')

    const tempRoot = await mkdtemp(join(tmpdir(), 'orca-md-doc-test-'))
    const externalDir = await mkdtemp(join(tmpdir(), 'orca-md-doc-ext-'))

    try {
      // 1. Regular file
      await writeFile(join(tempRoot, 'README.md'), '# Root readme')

      // 2. Whitelisted .tasks directory
      await mkdir(join(tempRoot, '.tasks'))
      await writeFile(join(tempRoot, '.tasks', 'T464.md'), '# Task 464')

      // 3. Ignored dot directory (e.g. .hidden)
      await mkdir(join(tempRoot, '.hidden'))
      await writeFile(join(tempRoot, '.hidden', 'secret.md'), '# Hidden')

      // 4. In-workspace directory symlink
      await mkdir(join(tempRoot, 'real-notes'))
      await writeFile(join(tempRoot, 'real-notes', 'note1.md'), '# Note 1')
      await symlink(join(tempRoot, 'real-notes'), join(tempRoot, 'linked-notes'))

      // 5. External directory symlink (should be skipped)
      await writeFile(join(externalDir, 'outside.md'), '# Outside')
      await symlink(externalDir, join(tempRoot, 'external-link'))

      // 6. Cyclic directory symlink inside workspace (should not loop)
      await mkdir(join(tempRoot, 'loop-a'))
      await mkdir(join(tempRoot, 'loop-a', 'loop-b'))
      await symlink(join(tempRoot, 'loop-a'), join(tempRoot, 'loop-a', 'loop-b', 'to-a'))
      await writeFile(join(tempRoot, 'loop-a', 'loop.md'), '# Loop')

      const docs = await listMarkdownDocuments(tempRoot)
      const relPaths = docs.map((d) => d.relativePath)

      expect(relPaths).toContain('README.md')
      expect(relPaths).toContain('.tasks/T464.md')
      expect(relPaths).toContain('real-notes/note1.md')
      expect(relPaths).toContain('linked-notes/note1.md')
      expect(relPaths).toContain('loop-a/loop.md')
      expect(relPaths).not.toContain('.hidden/secret.md')
      expect(relPaths).not.toContain('external-link/outside.md')
    } finally {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
      await rm(externalDir, { recursive: true, force: true }).catch(() => {})
    }
  })
})
