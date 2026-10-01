import { type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_PORT, SURFACE_MAX_COLUMNS, SURFACE_MAX_ROWS, type Surface } from './protocol.js'

export type ModuleConfig = {
	host: string
	port: number
	surfaceEnabled: boolean
	surfaceId: string
	surfaceColumns: number
	surfaceRows: number
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
		{
			type: 'checkbox',
			id: 'surfaceEnabled',
			label: 'Provide a button panel to SuperConductor',
			description:
				'When enabled, a button panel shows up in SuperConductor (like a Stream Deck does), so that triggers and button areas can be assigned to its keys in SuperConductor. Use the "Button panel" presets to put the keys on your buttons.',
			width: 12,
			default: false,
		},
		{
			type: 'textinput',
			id: 'surfaceId',
			label: 'Button panel id',
			description: 'The triggers and button areas in SuperConductor are tied to this id.',
			width: 6,
			default: 'companion',
			isVisibleExpression: '$(options:surfaceEnabled)',
		},
		{
			type: 'number',
			id: 'surfaceColumns',
			label: 'Columns',
			width: 3,
			min: 1,
			max: SURFACE_MAX_COLUMNS,
			default: 8,
			isVisibleExpression: '$(options:surfaceEnabled)',
		},
		{
			type: 'number',
			id: 'surfaceRows',
			label: 'Rows',
			width: 3,
			min: 1,
			max: SURFACE_MAX_ROWS,
			default: 4,
			isVisibleExpression: '$(options:surfaceEnabled)',
		},
	]
}

/** Config values might be missing (like after an upgrade of the module), so apply the defaults */
export function sanitizeConfig(config: Partial<ModuleConfig>): ModuleConfig {
	return {
		host: `${config.host ?? ''}`.trim() || '127.0.0.1',
		port: clampInteger(config.port, 1, 65535, DEFAULT_PORT),
		surfaceEnabled: !!config.surfaceEnabled,
		surfaceId: `${config.surfaceId ?? ''}`.trim() || 'companion',
		surfaceColumns: clampInteger(config.surfaceColumns, 1, SURFACE_MAX_COLUMNS, 8),
		surfaceRows: clampInteger(config.surfaceRows, 1, SURFACE_MAX_ROWS, 4),
	}
}
/** The virtual button panel to provide to SuperConductor, if any */
export function getSurface(config: ModuleConfig, label: string): Surface | null {
	if (!config.surfaceEnabled) return null
	return {
		id: config.surfaceId,
		name: `Companion (${label})`,
		columns: config.surfaceColumns,
		rows: config.surfaceRows,
	}
}

function clampInteger(value: unknown, min: number, max: number, defaultValue: number): number {
	const num = Math.floor(Number(value))
	if (value === undefined || value === null || value === '' || Number.isNaN(num)) return defaultValue
	return Math.max(min, Math.min(max, num))
}
