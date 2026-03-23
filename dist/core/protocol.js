import { BaseProtocol } from 'ws-event-proxy';
export const WSProtocol = {
    reconnectTimeout: 2000,
    proxy: BaseProtocol,
    resolveEventType(name) {
        return { type: name };
    }
};
//# sourceMappingURL=protocol.js.map