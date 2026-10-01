import { type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_PORT } from './protocol.js'

export type ModuleConfig = {
	host: string
	port: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'This module connects to the Companion API of SuperConductor. Enable it in SuperConductor: Home page → Bridges → Companion.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'SuperConductor host',
			width: 8,
			default: '127.0.0.1',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
	]
}

/** Config values might be missing (like after an upgrade of the module), so apply the defaults */
export function sanitizeConfig(config: Partial<ModuleConfig>): ModuleConfig {
	return {
		host: `${config.host ?? ''}`.trim() || '127.0.0.1',
		port: clampInteger(config.port, 1, 65535, DEFAULT_PORT),
	}
}

function clampInteger(value: unknown, min: number, max: number, defaultValue: number): number {
	const num = Math.floor(Number(value))
	if (value === undefined || value === null || value === '' || Number.isNaN(num)) return defaultValue
	return Math.max(min, Math.min(max, num))
}
