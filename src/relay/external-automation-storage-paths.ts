import { homedir } from 'node:os'
import { join } from 'node:path'

export const HERMES_HOME = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
export const HERMES_CRON_DIR = join(HERMES_HOME, 'cron')
export const HERMES_JOBS_FILE = join(HERMES_CRON_DIR, 'jobs.json')
export const HERMES_OUTPUT_DIR = join(HERMES_CRON_DIR, 'output')
export const HERMES_STATE_DB = join(HERMES_HOME, 'state.db')
export const OPENCLAW_HOME = process.env.OPENCLAW_STATE_DIR?.trim() || join(homedir(), '.openclaw')
export const OPENCLAW_JOBS_FILE = join(OPENCLAW_HOME, 'cron', 'jobs.json')
