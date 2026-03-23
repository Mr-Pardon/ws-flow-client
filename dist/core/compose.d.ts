import type { StreamTask } from './stream-task';
import type { AnyRecord } from '../types/ws';
import type { Middleware, StreamMiddleware, StreamCtx, WSMessageContext, WSSendContext } from '../types/middleware';
export declare const composeMiddleware: <T, Events extends AnyRecord>(middlewares: Middleware<T, Events>[]) => (ctx: WSMessageContext<T, Events> | WSSendContext<T, Events>) => Promise<void>;
export declare const composeStreamMiddleware: <Receive, Events extends AnyRecord>(middlewares: StreamMiddleware<Receive, Events>[]) => (task: StreamTask<Receive, Events>, ctx: StreamCtx<Receive, Events>) => StreamTask<Receive, Events>;
//# sourceMappingURL=compose.d.ts.map