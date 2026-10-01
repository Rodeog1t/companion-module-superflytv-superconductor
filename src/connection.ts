import WebSocket from 'ws'
import {
	PROTOCOL_VERSION,
	type ClientMessage,
	type CompanionState,
	type GroupCommand,
	type PartCommand,
	type ServerMessage,
} from './protocol.js'

/** How long to wait before trying to connect again */
const RECONNECT_DELAY = 2000
/** How often to ping SuperConductor (to detect a lost connection and to measure the clock difference) */
const PING_INTERVAL = 5000
/** The connection is considered lost when nothing has been received for this long */
const RECEIVE_TIMEOUT = 15000
/** How long to wait for the reply to a command */
const COMMAND_TIMEOUT = 5000

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface ConnectionOptions {
	host: string
	port: number
}
export interface ConnectionCallbacks {
	onStatus: (status: ConnectionStatus, message?: string) => void
	/** Called when connected, before the first state */
	onConnected: (appVersion: string) => void
	onState: (state: CompanionState) => void
	/** Called when SuperConductor reports a problem that isn't tied to a command */
	onError: (message: string) => void
}

/** Handles the connection to the Companion API of SuperConductor */
export class Connection {
	private ws: WebSocket | null = null
	private closed = false
	private isConnected = false

	private reconnectTimeout: NodeJS.Timeout | null = null
	private pingInterval: NodeJS.Timeout | null = null
	private lastReceived = 0

	private nextCommandId = 1
	private pendingCommands = new Map<
		number,
		{ resolve: () => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }
	>()

	/** How much to add to the local time to get the time of SuperConductor [ms] */
	private clockOffset = 0
	/** The round trip time of the measurement that clockOffset is based on */
	private clockOffsetRtt = Infinity

	constructor(
		private options: ConnectionOptions,
		private callbacks: ConnectionCallbacks,
	) {}

	start(): void {
		this.connect()
	}
	close(): void {
		this.closed = true
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
			this.reconnectTimeout = null
		}
		this.cleanupSocket()
	}
	get connected(): boolean {
		return this.isConnected
	}
	/** The current time, in the clock of SuperConductor */
	now(): number {
		return Date.now() + this.clockOffset
	}

	/** Sends a playout command. The returned promise is rejected if the command wasn't executed. */
	async sendCommand(
		command: PartCommand | GroupCommand,
		target: { rundownId: string; groupId: string; partId?: string },
	): Promise<void> {
		if (!this.isConnected) throw new Error('Not connected to SuperConductor')

		const id = this.nextCommandId++
		return new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingCommands.delete(id)
				reject(new Error(`No reply from SuperConductor to the command "${command}"`))
			}, COMMAND_TIMEOUT)
			this.pendingCommands.set(id, { resolve, reject, timeout })

			this.send({ type: 'command', id, command, ...target })
		})
	}

	private connect() {
		if (this.closed) return
		this.callbacks.onStatus('connecting')

		const host = this.options.host.includes(':') ? `[${this.options.host}]` : this.options.host
		let ws: WebSocket
		try {
			ws = new WebSocket(`ws://${host}:${this.options.port}`)
		} catch (e) {
			this.callbacks.onStatus('disconnected', errorMessage(e))
			this.scheduleReconnect()
			return
		}
		this.ws = ws
		this.lastReceived = Date.now()

		let errorText: string | undefined

		ws.on('open', () => {
			if (this.ws !== ws) return
			this.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION })
		})
		ws.on('message', (data) => {
			if (this.ws !== ws) return
			this.lastReceived = Date.now()

			let msg: ServerMessage
			try {
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				msg = JSON.parse(data.toString())
			} catch (_e) {
				return
			}
			if (msg.type === 'error') errorText = msg.message
			this.onMessage(msg)
		})
		ws.on('error', (error) => {
			if (this.ws !== ws) return
			errorText = error.message
		})
		ws.on('close', () => {
			if (this.ws !== ws) return
			this.cleanupSocket()
			this.callbacks.onStatus('disconnected', errorText)
			this.scheduleReconnect()
		})

		this.pingInterval = setInterval(() => {
			if (Date.now() - this.lastReceived > RECEIVE_TIMEOUT) {
				errorText = 'Connection timed out'
				ws.terminate()
				return
			}
			if (this.isConnected) this.send({ type: 'ping', t: Date.now() })
		}, PING_INTERVAL)
	}
	private scheduleReconnect() {
		if (this.closed || this.reconnectTimeout) return
		this.reconnectTimeout = setTimeout(() => {
			this.reconnectTimeout = null
			this.connect()
		}, RECONNECT_DELAY)
	}
	private cleanupSocket() {
		const ws = this.ws
		this.ws = null
		this.isConnected = false
		this.clockOffsetRtt = Infinity

		if (this.pingInterval) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
		for (const pending of this.pendingCommands.values()) {
			clearTimeout(pending.timeout)
			pending.reject(new Error('Connection to SuperConductor was lost'))
		}
		this.pendingCommands.clear()

		if (ws) {
			ws.removeAllListeners()
			// An error might be emitted when closing a socket that isn't open yet:
			ws.on('error', () => null)
			try {
				ws.terminate()
			} catch (_e) {
				// Ignore, it is already closed
			}
		}
	}
	private onMessage(msg: ServerMessage) {
		switch (msg.type) {
			case 'welcome':
				// A first rough estimate, it is refined by the pings:
				this.clockOffset = msg.serverTime - Date.now()
				this.isConnected = true
				this.callbacks.onStatus('connected')
				this.callbacks.onConnected(msg.appVersion)
				this.send({ type: 'ping', t: Date.now() })
				break
			case 'pong': {
				const now = Date.now()
				const rtt = now - msg.t
				// The shorter the round trip, the more accurate the measurement is.
				// (The stored round trip time is slowly increased, so that a drifting clock is followed.)
				this.clockOffsetRtt *= 1.2
				if (rtt >= 0 && rtt <= this.clockOffsetRtt) {
					this.clockOffsetRtt = rtt
					this.clockOffset = msg.serverTime - (msg.t + rtt / 2)
				}
				break
			}
			case 'state':
				this.callbacks.onState(msg.state)
				break
			case 'reply': {
				const pending = this.pendingCommands.get(msg.id)
				if (!pending) break
				this.pendingCommands.delete(msg.id)
				clearTimeout(pending.timeout)
				if (msg.ok) pending.resolve()
				else pending.reject(new Error(msg.error || 'Unknown error'))
				break
			}
			case 'error':
				this.callbacks.onError(msg.message)
				break
		}
	}
	private send(msg: ClientMessage) {
		if (this.ws?.readyState !== WebSocket.OPEN) return
		this.ws.send(JSON.stringify(msg))
	}
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : `${e}`
}
