import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

// Test stand-in for the Docker Engine API on a Unix socket (docker-observer and docker-logs
// tests only). Speaks the calls of ADR-0005 and ADR-0008 with the real response shapes.

export interface FakeContainer {
  readonly id: string
  name: string
  status: string
  health?: string
  exitCode?: number
  labels?: Record<string, string>
  /** Status taken right after the next inspect has been answered (simulates a change in flight). */
  statusAfterInspect?: string
}

export class FakeDockerDaemon {
  readonly containers = new Map<string, FakeContainer>()
  readonly requests: string[] = []
  /** Paths whose response has been fully sent, in order: lets tests wait for a slow answer. */
  readonly answered: string[] = []
  /** Runs once, when the next container list is requested — before it is answered. */
  beforeNextList: (() => void) | undefined
  /** Next list / inspect answered with this HTTP status and an HTML body, as a broken proxy would. */
  nextListStatus: number | undefined
  nextInspectStatus: number | undefined
  /** Next inspect sends its headers and half a body, then drops the connection. */
  cutNextInspect = false
  /** Next `/events` request is accepted but never answered, as a hung daemon would. */
  hangNextEvents = false
  /** Delay before answering every inspect. */
  inspectDelayMs = 0
  /** Containers whose logs are a raw stream (TTY); the others are multiplexed. */
  readonly ttyLogs = new Set<string>()
  /** Query strings of the log requests, in order. */
  readonly logQueries: string[] = []
  private server: Server | undefined
  private readonly streams = new Set<ServerResponse>()
  private readonly logStreams = new Set<ServerResponse>()

  constructor(readonly socketPath: string) {}

  add(container: FakeContainer): void {
    this.containers.set(container.id, container)
  }

  /** Pushes an event to every open `/events` stream, like the daemon does. */
  emit(action: string, id: string): void {
    const line = `${JSON.stringify({ Type: 'container', Action: action, Actor: { ID: id, Attributes: {} } })}\n`
    for (const stream of this.streams) stream.write(line)
  }

  /** Writes raw bytes on every open event stream (split or malformed lines). */
  emitRaw(text: string): void {
    for (const stream of this.streams) stream.write(text)
  }

  get openStreams(): number {
    return this.streams.size
  }

  /** Ends every event stream, as a daemon restart would. */
  dropStreams(): void {
    for (const stream of this.streams) stream.end()
    this.streams.clear()
  }

  /** Writes raw bytes on every open log stream. */
  writeLogs(bytes: Uint8Array): void {
    for (const stream of this.logStreams) stream.write(bytes)
  }

  get openLogStreams(): number {
    return this.logStreams.size
  }

  /** Ends every log stream, as a stopped container does. */
  endLogs(): void {
    for (const stream of this.logStreams) stream.end()
    this.logStreams.clear()
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      this.handle(request, response)
    })
    const server = this.server
    await new Promise<void>((resolve) => {
      server.listen(this.socketPath, resolve)
    })
  }

  async stop(): Promise<void> {
    this.dropStreams()
    this.endLogs()
    const server = this.server
    this.server = undefined
    if (server === undefined) return
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? '/', 'http://docker')
    this.requests.push(url.pathname)
    response.on('finish', () => this.answered.push(url.pathname))
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (url.pathname === '/v1.47/events') {
      if (this.hangNextEvents) {
        this.hangNextEvents = false
        // Tracked so `stop()` ends it even if the client never gives up.
        this.streams.add(response)
        response.on('close', () => this.streams.delete(response))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.flushHeaders()
      this.streams.add(response)
      response.on('close', () => this.streams.delete(response))
      return
    }
    const logs = /^\/v1\.47\/containers\/([^/]+)\/logs$/.exec(url.pathname)?.[1]
    if (logs !== undefined) {
      this.logQueries.push(url.search)
      if (!this.containers.has(logs)) {
        json(404, { message: 'No such container' })
        return
      }
      const type = this.ttyLogs.has(logs) ? 'raw-stream' : 'multiplexed-stream'
      response.writeHead(200, { 'content-type': `application/vnd.docker.${type}` })
      response.flushHeaders()
      this.logStreams.add(response)
      response.on('close', () => this.logStreams.delete(response))
      return
    }
    if (url.pathname === '/v1.47/containers/json') {
      const hook = this.beforeNextList
      this.beforeNextList = undefined
      hook?.()
      const status = this.nextListStatus
      this.nextListStatus = undefined
      if (status !== undefined) {
        response.writeHead(status, { 'content-type': 'text/html' }).end('<html>error</html>')
        return
      }
      json(200, [...this.containers.keys()].map((id) => ({ Id: id })))
      return
    }
    // The answer is decided now and sent after the delay: a slow response carries the state
    // of the moment it was asked, like a real one.
    const reply = this.prepareInspect(url.pathname, response, json)
    setTimeout(reply, this.inspectDelayMs)
  }

  private prepareInspect(pathname: string, response: ServerResponse, json: (status: number, body: unknown) => void): () => void {
    const status = this.nextInspectStatus
    this.nextInspectStatus = undefined
    if (status !== undefined) {
      return () => response.writeHead(status, { 'content-type': 'text/html' }).end('<html>error</html>')
    }
    if (this.cutNextInspect) {
      this.cutNextInspect = false
      return () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.write('{"Id": "trunc')
        response.socket?.destroy()
      }
    }
    const inspect = /^\/v1\.47\/containers\/([^/]+)\/json$/.exec(pathname)
    const container = inspect?.[1] === undefined ? undefined : this.containers.get(inspect[1])
    if (container === undefined) {
      return () => {
        json(404, { message: 'No such container' })
      }
    }
    const body = {
      Id: container.id,
      Name: `/${container.name}`,
      Config: { Image: 'img', Labels: container.labels ?? {} },
      State: {
        Status: container.status,
        ExitCode: container.exitCode ?? 0,
        ...(container.health === undefined ? {} : { Health: { Status: container.health } })
      },
      NetworkSettings: { Ports: {} }
    }
    if (container.statusAfterInspect !== undefined) {
      container.status = container.statusAfterInspect
      delete container.statusAfterInspect
    }
    return () => {
      json(200, body)
    }
  }
}
