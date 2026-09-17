import {
  orchestrationDeepLinkFromArguments,
  type OrchestrationDeepLink
} from '../../shared/orchestration-deep-link'

export class OrchestrationDeepLinkState {
  private pendingDeepLink: OrchestrationDeepLink | null = null

  capture(argv: readonly string[], publish?: (link: OrchestrationDeepLink) => void): boolean {
    const link = orchestrationDeepLinkFromArguments(argv)
    if (!link) {
      return false
    }
    this.pendingDeepLink = link
    publish?.(link)
    return true
  }

  consume(): OrchestrationDeepLink | null {
    const link = this.pendingDeepLink
    this.pendingDeepLink = null
    return link
  }
}
