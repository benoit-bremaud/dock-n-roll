const DEFAULT_SOCKET = '/var/run/docker.sock'

/**
 * The Docker socket the app observes and pins the CLI to (ADR-0002, ADR-0005): a unix
 * `DOCKER_HOST` present at startup (rootless Docker) wins; anything the observer cannot open
 * (tcp, ssh, relative paths) falls back to the standard socket.
 */
export function dockerSocketPath(env: NodeJS.ProcessEnv): string {
  const host = env['DOCKER_HOST']
  if (host?.startsWith('unix:///') === true) return host.slice('unix://'.length)
  return DEFAULT_SOCKET
}
