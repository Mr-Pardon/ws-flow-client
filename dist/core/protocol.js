import { BaseProtocol } from 'ws-event-proxy';
export const WSProtocol = {
    reconnectTimeout: 2000,
    resolveEventType(name) {
        return { type: name };
    },
    ...BaseProtocol,
};
//# sourceMappingURL=protocol.js.map