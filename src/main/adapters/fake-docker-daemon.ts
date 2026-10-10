import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

// Test stand-in for the Docker Engine API on a Unix socket (used by docker-observer.test.ts
// only). Speaks the three calls of ADR-0005 with the real response shapes.

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
  /** Runs once, when the next container list is requested — before it is answered. */
  beforeNextList: (() => void) | undefined
  private server: Server | undefined
  private readonly streams = new Set<ServerResponse>()

  constructor(readonly socketPath: string) {}

  add(container: FakeContainer): void {
    this.containers.set(container.id, container)
  }

  /** Pushes an event to every open `/events` stream, like the daemon does. */
  emit(action: string, id: string): void {
    const line = `${JSON.stringify({ Type: 'container', Action: action, Actor: { ID: id, Attributes: {} } })}\n`
    for (const stream of this.streams) stream.write(line)
  }

  get openStreams(): number {
    return this.streams.size
  }

  /** Ends every event stream, as a daemon restart would. */
  dropStreams(): void {
    for (const stream of this.streams) stream.end()
    this.streams.clear()
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
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (url.pathname === '/v1.47/events') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.flushHeaders()
      this.streams.add(response)
      response.on('close', () => this.streams.delete(response))
      return
    }
    if (url.pathname === '/v1.47/containers/json') {
      const hook = this.beforeNextList
      this.beforeNextList = undefined
      hook?.()
      json(200, [...this.containers.keys()].map((id) => ({ Id: id })))
      return
    }
    const inspect = /^\/v1\.47\/containers\/([^/]+)\/json$/.exec(url.pathname)
    const container = inspect?.[1] === undefined ? undefined : this.containers.get(inspect[1])
    if (container === undefined) {
      json(404, { message: 'No such container' })
      return
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
    json(200, body)
  }
}
