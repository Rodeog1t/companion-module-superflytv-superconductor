import {
	InstanceBase,
	InstanceStatus,
	type CompanionVariableValues,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { GetConfigFields, getSurface, sanitizeConfig, type ModuleConfig } from './config.js'
import { Connection } from './connection.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { STATE_FEEDBACKS, TIME_FEEDBACKS, UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import type { CompanionState, GroupCommand, KeyDisplay, PartCommand } from './protocol.js'
import { getTimeSignature, StateStore } from './state.js'
import { SurfaceKeys } from './surface.js'
import { getVariableDefinitions, getVariableValues, type VariablesSchema } from './variables.js'

/** How often to check if the timers need to be updated */
const TICK_INTERVAL = 100

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	/** The rundowns and the playout state of SuperConductor */
	readonly store = new StateStore()
	/** What SuperConductor wants to display on the keys of the button panel */
	readonly surfaceKeys = new SurfaceKeys()
	/** The version of the SuperConductor we're connected to */
	appVersion = ''

	private connection: Connection | null = null
	private tickInterval: NodeJS.Timeout | null = null
	private updateSurfaceTimeout: NodeJS.Timeout | null = null

	/** Used to tell when the actions, feedbacks, presets and variables need to be defined again */
	private definitionsSignature: string | null = null
	/** Used to tell when the timers need to be updated */
	private timeSignature = ''
	/** The values of the variables, as they were last sent to Companion */
	private variableValues: CompanionVariableValues = {}
	/** True when something has been received from SuperConductor since it was last cleared */
	private hasData = false

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = sanitizeConfig(config)

		this.updateDefinitions()
		this.setupConnection()

		this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		if (this.tickInterval) clearInterval(this.tickInterval)
		this.tickInterval = null
		if (this.updateSurfaceTimeout) clearTimeout(this.updateSurfaceTimeout)
		this.updateSurfaceTimeout = null

		this.connection?.close()
		this.connection = null
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = sanitizeConfig(config)

		this.setupConnection()
		this.updateDefinitions()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The current time, in the clock of SuperConductor */
	now(): number {
		return this.connection?.now() ?? Date.now()
	}
	/** Number of keys on the button panel. 0 if there is no button panel */
	get surfaceKeyCount(): number {
		if (!this.config.surfaceEnabled) return 0
		return this.config.surfaceColumns * this.config.surfaceRows
	}

	/** Sends a playout command to SuperConductor. Problems are logged. */
	async sendCommand(
		command: PartCommand | GroupCommand,
		target: { rundownId: string; groupId: string; partId?: string },
	): Promise<void> {
		try {
			if (!this.connection) throw new Error('Not connected to SuperConductor')
			await this.connection.sendCommand(command, target)
		} catch (e) {
			this.log('warn', `Command "${command}" failed: ${e instanceof Error ? e.message : e}`)
		}
	}
	/** Tells SuperConductor that a key on the button panel was pressed or released. Problems are logged. */
	sendKey(key: number, down: boolean): void {
		try {
			if (!this.config.surfaceEnabled) {
				throw new Error('The button panel is not enabled in the configuration of the connection')
			}
			if (!this.connection) throw new Error('Not connected to SuperConductor')
			this.connection.sendKey(key, down)
		} catch (e) {
			this.log('warn', `Button panel key ${key} failed: ${e instanceof Error ? e.message : e}`)
		}
	}

	private setupConnection(): void {
		this.connection?.close()
		this.onDisconnected()

		let hasFailed = false
		const connection = new Connection(
			{
				host: this.config.host,
				port: this.config.port,
				surface: getSurface(this.config, this.label),
			},
			{
				onStatus: (status, message) => {
					if (this.connection !== connection) return
					if (status === 'connected') {
						hasFailed = false
						this.updateStatus(InstanceStatus.Ok)
					} else if (status === 'connecting') {
						// Don't flicker between "connecting" and "failure" while retrying:
						if (!hasFailed) this.updateStatus(InstanceStatus.Connecting)
					} else {
						if (!hasFailed && message) this.log('warn', `Connection to SuperConductor failed: ${message}`)
						hasFailed = true
						this.updateStatus(InstanceStatus.ConnectionFailure, message ?? null)
						this.onDisconnected()
					}
				},
				onConnected: (appVersion) => {
					if (this.connection !== connection) return
					this.appVersion = appVersion
					this.log('info', `Connected to SuperConductor ${appVersion}`)
				},
				onState: (state) => {
					if (this.connection !== connection) return
					this.onState(state)
				},
				onKeyDisplay: (key, display) => {
					if (this.connection !== connection) return
					this.onKeyDisplay(key, display)
				},
				onError: (message) => {
					if (this.connection !== connection) return
					this.log('warn', `SuperConductor reported: ${message}`)
				},
			},
		)
		this.connection = connection
		connection.start()
	}
	private onState(state: CompanionState): void {
		this.hasData = true
		this.store.setState(state)

		this.updateDefinitions()
		this.updateVariables()
		this.checkFeedbacks(STATE_FEEDBACKS[0], ...STATE_FEEDBACKS.slice(1))
	}
	private onKeyDisplay(key: number, display: KeyDisplay): void {
		this.hasData = true
		this.surfaceKeys.set(key, display)

		// Many keys are often updated at the same time, so handle them together:
		if (!this.updateSurfaceTimeout) {
			this.updateSurfaceTimeout = setTimeout(() => {
				this.updateSurfaceTimeout = null
				this.updateVariables()
				this.checkFeedbacks('surface_key')
			}, 10)
		}
	}
	/** Called when there is no connection to SuperConductor: nothing is known about the playout */
	private onDisconnected(): void {
		// Note: The definitions are not updated here, so that the buttons can still be edited
		// using the last known rundowns while SuperConductor is away.
		if (!this.hasData) return
		this.hasData = false

		this.store.clear()
		this.surfaceKeys.clear()
		this.appVersion = ''
		this.timeSignature = ''

		this.updateVariables()
		this.checkAllFeedbacks()
	}
	/** Called often, to keep the timers running */
	private tick(): void {
		if (!this.connection?.connected) return

		// Only do something when a timer would display something new:
		const timeSignature = getTimeSignature(this.store.getState(), this.now())
		if (timeSignature === this.timeSignature) return
		this.timeSignature = timeSignature

		this.updateVariables()
		this.checkFeedbacks(TIME_FEEDBACKS[0], ...TIME_FEEDBACKS.slice(1))
	}

	/**
	 * (Re)defines the actions, feedbacks, presets and variables.
	 * They depend on the rundowns, since they list the groups and parts to choose from.
	 */
	private updateDefinitions(): void {
		const signature = JSON.stringify({
			surface: this.config.surfaceEnabled ? [this.config.surfaceColumns, this.config.surfaceRows] : null,
			rundowns: this.store
				.getState()
				.rundowns.map((rundown) => [
					rundown.id,
					rundown.name,
					rundown.groups.map((group) => [
						group.id,
						group.name,
						group.transparent,
						group.parts.map((part) => [part.id, part.name, part.label]),
					]),
				]),
		})
		if (signature === this.definitionsSignature) return
		this.definitionsSignature = signature

		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)

		this.setVariableDefinitions(getVariableDefinitions(this))
		// Variables that are defined again need their values again:
		this.variableValues = {}
		this.updateVariables()
	}
	/** Sends the values of the variables that has changed to Companion */
	private updateVariables(): void {
		const values = getVariableValues(this, this.now())

		const changed: CompanionVariableValues = {}
		let hasChanged = false
		for (const [id, value] of Object.entries(values)) {
			if (this.variableValues[id] !== value) {
				changed[id] = value
				hasChanged = true
			}
		}
		// Clear the variables that there are no values for anymore (like when the connection is lost):
		for (const id of Object.keys(this.variableValues)) {
			if (!(id in values)) {
				changed[id] = ''
				hasChanged = true
			}
		}
		this.variableValues = values
		if (hasChanged) this.setVariableValues(changed)
	}
}
