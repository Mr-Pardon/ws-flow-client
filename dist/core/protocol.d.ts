import { type Protocol as ProxyProtocol } from 'ws-event-proxy';
export interface WSProtocol extends Partial<ProxyProtocol> {
    reconnectTimeout: number;
    resolveEventType(name: string): Record<string, any>;
    /**
     * @deprecated Use top-level proxy fields instead.
     */
    proxy?: Partial<ProxyProtocol>;
}
export declare const WSProtocol: WSProtocol;
//# sourceMappingURL=protocol.d.ts.map