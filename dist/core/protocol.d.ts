import { type Protocol as ProxyProtocol } from 'ws-event-proxy';
export interface Protocol {
    reconnectTimeout: number;
    proxy: Partial<ProxyProtocol>;
    resolveEventType(name: string): Record<string, any>;
}
export declare const WSProtocol: Protocol;
//# sourceMappingURL=protocol.d.ts.map