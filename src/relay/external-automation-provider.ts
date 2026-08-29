export type ExternalAutomationProvider = 'hermes' | 'openclaw' | 'zeroclaw'

export type ExternalAutomationAction = 'pause' | 'resume' | 'run' | 'delete'

export const EXTERNAL_AUTOMATION_JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export function externalAutomationProvider(value: unknown): ExternalAutomationProvider {
  if (value === 'openclaw') {
    return 'openclaw'
  }
  if (value === 'zeroclaw') {
    return 'zeroclaw'
  }
  return 'hermes'
}

export function isExternalAutomationAction(value: unknown): value is ExternalAutomationAction {
  return value === 'pause' || value === 'resume' || value === 'run' || value === 'delete'
}
