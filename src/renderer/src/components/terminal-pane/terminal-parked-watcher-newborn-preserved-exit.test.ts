import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why this file: pty-exit-hibernate's sole-newborn guard keeps a dead
// never-typed fresh-spawn pane visible (failing .envrc diagnostics). The parked
// sidecar owns detached exits now, so it must reach the same verdict from the
// plain `untouchedFreshSpawn` fact captured at unmount — the memory fix must
// not change tab-closing semantics.

const WORKTREE_ID = 'repo::/worktree'
const TAB_ID = 'tab-1'
const PTY_ID = `${WORKTREE_ID}@@session-1`
const SECOND_PTY_ID = `${WORKTREE_ID}@@session-2`
const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_LEAF_ID = '22222222-2222-4222-8222-222222222222'

const startedWatcherDisposers: ReturnType<typeof vi.fn>[] = []
vi.mock('./parked-terminal-byte-watcher', () => ({
  startParkedTerminalByteWatcher: () => {
    const dispose = vi.fn()
    startedWatcherDisposers.push(dispose)
    return dispose
  }
}))

type ExitCallback = (code: number, context: { hadPrimary: boolean }) => void
const exitCallbacksByPtyId = new Map<string, ExitCallback>()
vi.mock('./pty-dispatcher', () => ({
  subscribeToPtyExit: (ptyId: string, callback: ExitCallback) => {
    exitCallbacksByPtyId.set(ptyId, callback)
    return vi.fn()
  }
}))

const discardPreHandlerPtyState = vi.fn()
vi.mock('./pty-pre-handler-buffer', () => ({
  discardPreHandlerPtyState: (ptyId: string) => discardPreHandlerPtyState(ptyId),
  hasPreHandlerPtyExit: () => false
}))

const closeTerminalTab = vi.fn()
vi.mock('../terminal/terminal-tab-actions', () => ({
  closeTerminalTab: (tabId: string, options?: unknown) => closeTerminalTab(tabId, options)
}))

type MockStoreState = {
  tabsByWorktree: Record<string, { id: string; ptyId: string | null }[]>
  terminalLayoutsByTabId: Record<string, unknown>
  runtimePaneTitlesByTabId: Record<string, Record<number, string>>
  clearTabLaunchAgent: ReturnType<typeof vi.fn>
  clearRuntimePaneTitle: ReturnType<typeof vi.fn>
  setTabLayout: ReturnType<typeof vi.fn>
  updateTabTitle: ReturnType<typeof vi.fn>
  isPtyShutdownPending: ReturnType<typeof vi.fn>
  suppressedPtyExitIds: Record<string, true>
}
let mockStoreState: MockStoreState
vi.mock('@/store', () => ({
  useAppStore: { getState: () => mockStoreState }
}))

import { startParkedPtyWatcher } from './terminal-parked-pty-watcher'
import { resolveParkedTerminalPaneCandidates } from './terminal-parked-watcher-reconciliation'
import {
  capturedPanesByTabId,
  type ParkedTabWatcherEntry,
  type ParkedTerminalPaneCapture
} from './terminal-parked-watcher-registry'

function startWatchers(panes: ParkedTerminalPaneCapture[]): ParkedTabWatcherEntry {
  const entry: ParkedTabWatcherEntry = {
    worktreeId: WORKTREE_ID,
    tabPtyId: PTY_ID,
    paneIdByPtyId: new Map(),
    disposersByPtyId: new Map()
  }
  for (const pane of panes) {
    startParkedPtyWatcher({
      worktreeId: WORKTREE_ID,
      tab: { id: TAB_ID, ptyId: PTY_ID },
      pane,
      entry,
      restoreTitleOnRegister: false,
      restorePolicy: {}
    })
  }
  return entry
}

const solePane = (untouchedFreshSpawn?: boolean): ParkedTerminalPaneCapture[] => [
  {
    ptyId: PTY_ID,
    paneId: 1,
    leafId: LEAF_ID,
    drivesTabTitle: true,
    ...(untouchedFreshSpawn !== undefined ? { untouchedFreshSpawn } : {})
  }
]

describe('newborn-preserved parked exits (sole-owner sidecar)', () => {
  beforeEach(() => {
    mockStoreState = {
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      runtimePaneTitlesByTabId: {},
      clearTabLaunchAgent: vi.fn(),
      clearRuntimePaneTitle: vi.fn(),
      setTabLayout: vi.fn(),
      updateTabTitle: vi.fn(),
      isPtyShutdownPending: vi.fn(() => false),
      suppressedPtyExitIds: {}
    }
  })

  afterEach(() => {
    startedWatcherDisposers.length = 0
    exitCallbacksByPtyId.clear()
    capturedPanesByTabId.clear()
    vi.clearAllMocks()
  })

  it('preserves the tab when a sole untouched fresh-spawn pane exits', () => {
    const entry = startWatchers(solePane(true))

    exitCallbacksByPtyId.get(PTY_ID)?.(1, { hadPrimary: false })

    expect(closeTerminalTab).not.toHaveBeenCalled()
    // The buffered exit stays as the reveal's evidence, like the sleep branch.
    expect(discardPreHandlerPtyState).not.toHaveBeenCalled()
    expect(mockStoreState.clearRuntimePaneTitle).toHaveBeenCalledWith(TAB_ID, 1)
    expect(startedWatcherDisposers[0]).toHaveBeenCalled()
    expect(entry.disposersByPtyId.size).toBe(0)
    // Title slot survives disposal so a later clear can still find it.
    expect(entry.paneIdByPtyId.get(PTY_ID)).toBe(1)
  })

  it.each([
    ['typed-into shell', solePane(false)],
    ['reattached (not a fresh spawn)', solePane()]
  ] as const)('still closes the tab when a sole %s exits', (_case, panes) => {
    startWatchers(panes)

    exitCallbacksByPtyId.get(PTY_ID)?.(0, { hadPrimary: false })

    expect(closeTerminalTab).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({ hostCloseReason: 'pty-exit', lifecyclePtyId: PTY_ID })
    )
  })

  it('collapses a dead newborn split leaf while a sibling survives', () => {
    startWatchers([
      { ptyId: PTY_ID, paneId: 1, leafId: LEAF_ID, drivesTabTitle: true },
      {
        ptyId: SECOND_PTY_ID,
        paneId: 2,
        leafId: SECOND_LEAF_ID,
        drivesTabTitle: false,
        untouchedFreshSpawn: true
      }
    ])

    exitCallbacksByPtyId.get(SECOND_PTY_ID)?.(1, { hadPrimary: false })

    // Multi-pane parity: the session guard only preserves sole panes.
    expect(closeTerminalTab).not.toHaveBeenCalled()
    expect(discardPreHandlerPtyState).toHaveBeenCalledWith(SECOND_PTY_ID)
  })

  it('defers to a primary handler even for an untouched fresh spawn', () => {
    const entry = startWatchers(solePane(true))

    exitCallbacksByPtyId.get(PTY_ID)?.(0, { hadPrimary: true })

    expect(closeTerminalTab).not.toHaveBeenCalled()
    expect(startedWatcherDisposers[0]).toHaveBeenCalled()
    expect(entry.disposersByPtyId.size).toBe(0)
  })
})

describe('untouchedFreshSpawn carry through candidate reconciliation', () => {
  afterEach(() => {
    capturedPanesByTabId.clear()
  })

  const fallbackState = {
    terminalLayoutsByTabId: {
      [TAB_ID]: {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: PTY_ID }
      }
    },
    runtimePaneTitlesByTabId: {}
  } as unknown as Parameters<typeof resolveParkedTerminalPaneCandidates>[1]

  it('keeps the captured fact for the same PTY when the layout-fallback rescue runs', () => {
    // Stale capture (an extra pane the layout no longer has) forces the rescue path.
    capturedPanesByTabId.set(TAB_ID, {
      worktreeId: WORKTREE_ID,
      panes: [
        {
          ptyId: PTY_ID,
          paneId: 1,
          leafId: LEAF_ID,
          drivesTabTitle: true,
          untouchedFreshSpawn: true
        },
        { ptyId: SECOND_PTY_ID, paneId: 2, leafId: SECOND_LEAF_ID, drivesTabTitle: false }
      ]
    })

    const candidates = resolveParkedTerminalPaneCandidates(
      { id: TAB_ID, ptyId: PTY_ID },
      fallbackState
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0].untouchedFreshSpawn).toBe(true)
  })

  it('drops the fact when the leaf re-minted a different PTY', () => {
    capturedPanesByTabId.set(TAB_ID, {
      worktreeId: WORKTREE_ID,
      panes: [
        {
          ptyId: SECOND_PTY_ID,
          paneId: 1,
          leafId: LEAF_ID,
          drivesTabTitle: true,
          untouchedFreshSpawn: true
        }
      ]
    })

    const candidates = resolveParkedTerminalPaneCandidates(
      { id: TAB_ID, ptyId: PTY_ID },
      fallbackState
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0].untouchedFreshSpawn).toBeUndefined()
  })
})
