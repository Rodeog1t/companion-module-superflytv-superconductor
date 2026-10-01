import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocketServer, type WebSocket } from 'ws'
import ModuleInstance from '../main.js'
import {
	AttentionLevel,
	PROTOCOL_VERSION,
	type ClientMessage,
	type CompanionState,
	type ServerMessage,
} from '../protocol.js'
import { makePlayout, makeState } from './fixtures.js'

/******************************************************************************
 *
 * Runs the whole module against a stand-in for SuperConductor,
 * with a stand-in for Companion that records what the module tells it.
 *
 *****************************************************************************/

// Silence the logging of the module:
;(global as any).COMPANION_LOGGER = () => null

/** A stand-in for the Companion API of SuperConductor */
class FakeSuperConductor {
	readonly server = new WebSocketServer({ port: 0 })
	readonly received: ClientMessage[] = []
	state: CompanionState
	private socket: WebSocket | null = null

	constructor() {
		const state = makeState()
		state.rundowns.pop() // Keep only the "Show" rundown
		this.state = state

		this.server.on('connection', (socket) => {
			this.socket = socket
			socket.on('message', (data) => {
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				const msg: ClientMessage = JSON.parse(data.toString())
				this.received.push(msg)

				if (msg.type === 'hello') {
					this.send({
						type: 'welcome',
						protocolVersion: PROTOCOL_VERSION,
						appVersion: '1.2.3',
						serverTime: Date.now(),
					})
					this.sendState()
				} else if (msg.type === 'ping') {
					this.send({ type: 'pong', t: msg.t, serverTime: Date.now() })
				} else if (msg.type === 'command') {
					if (msg.command === 'playPart' && msg.partId === 'prtIntro') {
						const now = Date.now()
						this.state.rundowns[0].groups[0].playout = makePlayout({
							playing: true,
							playheads: {
								prtIntro: { startTime: now, endTime: now + 10000, duration: 10000, fromSchedule: false },
							},
							endTime: now + 10000,
							nextPartId: 'prtInterview',
						})
						this.sendState()
					}
					this.send({ type: 'reply', id: msg.id, ok: true })
				} else if (msg.type === 'key' && msg.down) {
					this.send({
						type: 'keyDisplay',
						key: msg.key,
						display: { attentionLevel: AttentionLevel.INFO, header: { long: 'Stop Intro' }, info: { long: '0:00:09' } },
					})
				}
			})
		})
	}
	get port(): number {
		return (this.server.address() as { port: number }).port
	}
	send(msg: ServerMessage): void {
		this.socket?.send(JSON.stringify(msg))
	}
	sendState(): void {
		this.send({ type: 'state', serverTime: Date.now(), state: this.state })
	}
	disconnectClient(): void {
		this.socket?.terminate()
	}
	close(): void {
		this.socket?.terminate()
		this.server.close()
	}
}

/** A stand-in for Companion, it records what the module tells it */
function makeFakeCompanion() {
	const companion = {
		_isInstanceContext: true as const,
		id: 'test',
		label: 'superconductor',
		upgradeScripts: [],
		status: '',
		actions: {} as Record<string, any>,
		feedbacks: {} as Record<string, any>,
		presetStructure: [] as any[],
		presets: {} as Record<string, any>,
		variableDefinitions: {} as Record<string, { name: string }>,
		variables: {} as Record<string, unknown>,
		checkedFeedbacks: [] as string[],

		saveConfig: () => null,
		updateStatus: (status: string) => {
			companion.status = status
		},
		setActionDefinitions: (actions: Record<string, any>) => {
			companion.actions = actions
		},
		setFeedbackDefinitions: (feedbacks: Record<string, any>) => {
			companion.feedbacks = feedbacks
		},
		setPresetDefinitions: (structure: any[], presets: Record<string, any>) => {
			companion.presetStructure = structure
			companion.presets = presets
		},
		setVariableDefinitions: (definitions: Record<string, { name: string }>) => {
			companion.variableDefinitions = definitions
			// Companion forgets the values of variables that are no longer defined:
			for (const id of Object.keys(companion.variables)) {
				if (!(id in definitions)) delete companion.variables[id]
			}
		},
		setVariableValues: (values: Record<string, unknown>) => {
			for (const id of Object.keys(values)) {
				assert.ok(id in companion.variableDefinitions, `The variable "${id}" is set, but is not defined`)
			}
			Object.assign(companion.variables, values)
		},
		checkFeedbacks: (ids: string[]) => {
			companion.checkedFeedbacks.push(...ids)
		},
		checkAllFeedbacks: () => {
			companion.checkedFeedbacks.push('*')
		},
		checkFeedbacksById: () => null,
		subscribeActions: () => null,
		unsubscribeActions: () => null,
		unsubscribeFeedbacks: () => null,
		recordAction: () => null,
		oscSend: () => null,
	}
	return companion
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
async function waitFor(check: () => boolean, what: string): Promise<void> {
	for (let i = 0; i < 250; i++) {
		if (check()) return
		await sleep(20)
	}
	throw new Error(`Timeout when waiting for ${what}`)
}

describe('Module', () => {
	let superConductor: FakeSuperConductor
	let companion: ReturnType<typeof makeFakeCompanion>
	let instance: ModuleInstance

	const introById = { mode: 'id', part: 'show.rundown.json|||grpMain|||prtIntro', group: '', index: 1 }
	const firstInMain = { mode: 'index', part: '', group: 'Main', index: 1 }
	const feedbackInfo = { id: 'fb', controlId: 'ctrl', previousOptions: null }

	before(async () => {
		superConductor = new FakeSuperConductor()
		await new Promise((resolve) => superConductor.server.once('listening', resolve))

		companion = makeFakeCompanion()
		instance = new ModuleInstance(companion)
		await instance.init({
			host: '127.0.0.1',
			port: superConductor.port,
			surfaceEnabled: true,
			surfaceId: 'test',
			surfaceColumns: 2,
			surfaceRows: 1,
		})
		await waitFor(() => companion.status === 'ok' && 'part_prtIntro_name' in companion.variables, 'the first state')
	})
	after(async () => {
		await instance.destroy()
		superConductor.close()
	})

	test('says hello and offers the button panel', () => {
		assert.deepEqual(superConductor.received[0], {
			type: 'hello',
			protocolVersion: PROTOCOL_VERSION,
			surface: { id: 'test', name: 'Companion (superconductor)', columns: 2, rows: 1 },
		})
	})
	test('lists the parts and groups to choose from', () => {
		const fields = companion.actions.part_play.options
		assert.deepEqual(fields.find((field: any) => field.id === 'part').choices, [
			{ id: 'show.rundown.json|||grpMain|||prtIntro', label: 'Main / Intro' },
			{ id: 'show.rundown.json|||grpMain|||prtInterview', label: 'Main / Interview' },
			{ id: 'show.rundown.json|||grpMain|||prtOutro', label: 'Main / Outro' },
			{ id: 'show.rundown.json|||grpHidden|||prtBumper', label: 'Bumper' },
		])
		assert.deepEqual(companion.feedbacks.group_playing.options.find((field: any) => field.id === 'group').choices, [
			{ id: 'show.rundown.json|||grpMain', label: 'Main' },
			{ id: 'show.rundown.json|||grpHidden', label: 'Bumper' },
		])
	})
	test('variables when nothing is playing', () => {
		assert.equal(companion.variables.app_version, '1.2.3')
		assert.equal(companion.variables.part_prtIntro_name, 'Intro')
		assert.equal(companion.variables.part_prtIntro_status, 'stopped')
		assert.equal(companion.variables.part_prtIntro_time, '0:10')
		assert.equal(companion.variables.group_grpMain_status, 'stopped')
		assert.equal(companion.variables.group_grpMain_current_part, '')
		assert.equal(companion.variables.key_1_header, '')
	})
	test('the presets only use actions and feedbacks that exist', () => {
		assert.deepEqual(
			companion.presetStructure.map((section) => section.name),
			['Show', 'Button panel'],
		)
		// Every preset in the structure is defined:
		const presetIds: string[] = companion.presetStructure.flatMap((section) =>
			section.definitions.flatMap((group: any) => group.presets),
		)
		assert.ok(presetIds.length > 10)
		for (const presetId of presetIds) assert.ok(companion.presets[presetId], `The preset "${presetId}" is not defined`)
		assert.equal(new Set(presetIds).size, presetIds.length)

		for (const [presetId, preset] of Object.entries(companion.presets)) {
			const actions = preset.steps.flatMap((step: any) => [...step.down, ...step.up])
			for (const action of actions) {
				const definition = companion.actions[action.actionId]
				assert.ok(definition, `${presetId}: The action "${action.actionId}" does not exist`)
				assertOptionsMatch(presetId, definition, action.options)
			}
			const feedbacks = [...preset.feedbacks, ...(preset.localVariables ?? [])]
			for (const feedback of feedbacks) {
				const definition = companion.feedbacks[feedback.feedbackId]
				assert.ok(definition, `${presetId}: The feedback "${feedback.feedbackId}" does not exist`)
				assertOptionsMatch(presetId, definition, feedback.options)
				// Only boolean feedbacks have a style in a preset:
				assert.equal('style' in feedback, definition.type === 'boolean' && !('variableName' in feedback), presetId)
			}
			// The local variables used in the text are defined:
			for (const [, variableName] of preset.style.text.matchAll(/\$\(local:(\w+)\)/g)) {
				assert.ok(
					preset.localVariables?.some((variable: any) => variable.variableName === variableName),
					`${presetId}: The local variable "${variableName}" is not defined`,
				)
			}
		}
	})
	test('playing a part', async () => {
		assert.equal(await companion.feedbacks.part_playing.callback({ ...feedbackInfo, options: introById }), false)
		assert.equal(await companion.feedbacks.part_next.callback({ ...feedbackInfo, options: firstInMain }), false)
		companion.checkedFeedbacks.length = 0

		// The button points at "the first part of the group Main":
		await companion.actions.part_play.callback({ options: firstInMain })
		assert.deepEqual(superConductor.received.at(-1), {
			type: 'command',
			id: 1,
			command: 'playPart',
			rundownId: 'show.rundown.json',
			groupId: 'grpMain',
			partId: 'prtIntro',
		})
		await waitFor(() => companion.variables.part_prtIntro_status === 'playing', 'the part to play')

		assert.ok(companion.checkedFeedbacks.includes('part_playing'))
		assert.equal(await companion.feedbacks.part_playing.callback({ ...feedbackInfo, options: introById }), true)
		assert.equal(await companion.feedbacks.part_playing.callback({ ...feedbackInfo, options: firstInMain }), true)
		assert.equal(await companion.feedbacks.part_paused.callback({ ...feedbackInfo, options: introById }), false)
		assert.equal(
			await companion.feedbacks.group_playing.callback({ ...feedbackInfo, options: { group: 'Main' } }),
			true,
		)

		// It has 10 seconds left, so it is "about to end" within 15 seconds but not within 5:
		const ending = companion.feedbacks.part_ending.callback
		assert.equal(await ending({ ...feedbackInfo, options: { ...introById, seconds: 15 } }), true)
		assert.equal(await ending({ ...feedbackInfo, options: { ...introById, seconds: 5 } }), false)

		const info = companion.feedbacks.part_info.callback
		assert.equal(await info({ ...feedbackInfo, options: { ...firstInMain, field: 'name' } }), 'Intro')
		assert.equal(await info({ ...feedbackInfo, options: { ...firstInMain, field: 'time' } }), '0:10')
		const current = { mode: 'current', part: '', group: 'Main', index: 1 }
		assert.equal(await info({ ...feedbackInfo, options: { ...current, field: 'name' } }), 'Intro')
		const next = { mode: 'next', part: '', group: 'Main', index: 1 }
		assert.equal(await info({ ...feedbackInfo, options: { ...next, field: 'name' } }), 'Interview')

		assert.equal(companion.variables.part_prtIntro_time, '0:10')
		assert.equal(companion.variables.group_grpMain_status, 'playing')
		assert.equal(companion.variables.group_grpMain_current_part, 'Intro')
		assert.equal(companion.variables.group_grpMain_next_part, 'Interview')
	})
	test('the timers count down by themselves', async () => {
		companion.checkedFeedbacks.length = 0
		await waitFor(() => companion.variables.part_prtIntro_time === '0:09', 'the timer to count down')

		assert.equal(companion.variables.group_grpMain_time_left, '0:09')
		assert.equal(companion.variables.part_prtIntro_time_left_seconds, 9)
		assert.ok(companion.checkedFeedbacks.includes('part_info'))
		// Feedbacks that don't depend on the time are left alone:
		assert.ok(!companion.checkedFeedbacks.includes('part_playing'))
	})
	test('a part that does not exist', async () => {
		const nowhere = { mode: 'index', part: '', group: 'Main', index: 9 }
		assert.equal(await companion.feedbacks.part_exists.callback({ ...feedbackInfo, options: nowhere }), false)
		assert.equal(await companion.feedbacks.part_exists.callback({ ...feedbackInfo, options: firstInMain }), true)
		assert.equal(
			await companion.feedbacks.part_info.callback({ ...feedbackInfo, options: { ...nowhere, field: 'time' } }),
			'',
		)

		const commandCount = superConductor.received.length
		await companion.actions.part_play.callback({ options: nowhere })
		assert.equal(superConductor.received.length, commandCount)
	})
	test('the button panel', async () => {
		await companion.actions.surface_key.callback({ options: { key: 1, pressed: true } })
		await waitFor(() => companion.variables.key_1_header === 'Stop Intro', 'the key display')
		assert.deepEqual(superConductor.received.at(-1), { type: 'key', key: 1, down: true })
		assert.equal(companion.variables.key_1_info, '0:00:09')
		assert.ok(companion.checkedFeedbacks.includes('surface_key'))

		const image = { width: 72, height: 72 }
		const style = await companion.feedbacks.surface_key.callback({ ...feedbackInfo, options: { key: 1 }, image })
		assert.equal(style.text, 'Stop Intro\n0:00:09')
		assert.ok(style.imageBuffer)
		// SuperConductor hasn't said anything about the other key:
		assert.deepEqual(
			await companion.feedbacks.surface_key.callback({ ...feedbackInfo, options: { key: 0 }, image }),
			{},
		)

		await companion.actions.surface_key.callback({ options: { key: 1, pressed: false } })
		await waitFor(() => {
			const last = superConductor.received.at(-1)
			return last?.type === 'key' && !last.down
		}, 'the key release')
		assert.deepEqual(superConductor.received.at(-1), { type: 'key', key: 1, down: false })
	})
	test('new parts in SuperConductor show up', async () => {
		superConductor.state.rundowns[0].groups[0].parts.push({
			id: 'prtNew',
			name: 'Credits',
			label: 'Credits',
			duration: 4000,
			disabled: false,
			loop: false,
			locked: false,
		})
		superConductor.sendState()
		await waitFor(() => companion.variables.part_prtNew_name === 'Credits', 'the new part')

		const choices = companion.actions.part_play.options.find((field: any) => field.id === 'part').choices
		assert.ok(choices.some((choice: any) => choice.label === 'Main / Credits'))
		assert.ok(companion.presets.part_prtNew)
		// The values of the other variables are still there:
		assert.equal(companion.variables.part_prtIntro_status, 'playing')
	})
	test('nothing is displayed as playing when the connection is lost', async () => {
		companion.checkedFeedbacks.length = 0
		superConductor.disconnectClient()
		await waitFor(() => companion.status === 'connection_failure', 'the connection to be lost')

		assert.equal(companion.variables.part_prtIntro_status, '')
		assert.equal(companion.variables.part_prtIntro_time, '')
		assert.equal(companion.variables.key_1_header, '')
		assert.ok(companion.checkedFeedbacks.includes('*'))
		assert.equal(await companion.feedbacks.part_playing.callback({ ...feedbackInfo, options: introById }), false)
		// The parts can still be chosen when editing buttons:
		assert.ok(companion.actions.part_play.options.find((field: any) => field.id === 'part').choices.length > 0)

		// It reconnects by itself:
		await waitFor(
			() => companion.status === 'ok' && companion.variables.part_prtIntro_status === 'playing',
			'the reconnect',
		)
	})
})

/** Checks that the options given in a preset are the ones that the action or feedback has */
function assertOptionsMatch(presetId: string, definition: { options: { id: string }[] }, options: object): void {
	const expected = definition.options.map((field) => field.id).sort()
	assert.deepEqual(Object.keys(options).sort(), expected, `${presetId}: The options do not match`)
}
