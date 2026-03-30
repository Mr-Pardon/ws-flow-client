import { 
  BaseProtocol, 
  type Protocol as ProxyProtocol
} from 'ws-event-proxy'

export interface WSProtocol extends Partial<ProxyProtocol> {
  reconnectTimeout: number;
  resolveEventType(name: string): Record<string, any>

  /**
   * Legacy nested proxy config (deprecated). Prefer flat proxy fields instead.
   */
  proxy?: Partial<ProxyProtocol>
}

export const WSProtocol: WSProtocol = {
  reconnectTimeout: 2000,
  resolveEventType(name) {
    return { type: name }
  },
  ...BaseProtocol,
}
