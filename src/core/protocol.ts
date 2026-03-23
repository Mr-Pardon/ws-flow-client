import { 
  BaseProtocol, 
  type Protocol as ProxyProtocol
} from 'ws-event-proxy'

export interface Protocol {
  reconnectTimeout: number;
  proxy: Partial<ProxyProtocol>

  resolveEventType(name: string): Record<string, any>
}

export const WSProtocol: Protocol = {
  reconnectTimeout: 2000,
  proxy: BaseProtocol,

  resolveEventType(name) {
    return { type: name }
  }
}
