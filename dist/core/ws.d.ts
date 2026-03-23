import { StreamTask } from './stream-task';
import { WSProxy, type RouteRule } from 'ws-event-proxy';
import { type Protocol } from './protocol';
import type { AnyRecord, WSHandler, WSSendOptions, WSSubscribeOptions, WSWatchOptions } from '../types/ws';
import type { EventMatcher, Middleware, SendMiddleware, StreamMiddleware } from '../types/middleware';
export declare enum WSState {
    IDLE = "IDLE",
    CONNECTING = "CONNECTING",
    OPEN = "OPEN",
    RECONNECTING = "RECONNECTING",
    CLOSED = "CLOSED"
}
export declare class WSClient<Events extends AnyRecord = AnyRecord> {
    private _ws;
    private _wsContext;
    private _wsProxy;
    private _wsProtocal;
    private _proxyProtocol;
    private _middlewares;
    private _sendMiddlewares;
    private _streamMiddlewares;
    private _eventRouteMiddlewares;
    private _eventMap;
    private _state;
    private _manualClose;
    private _url;
    private _connected;
    private _connectResolve;
    private _connectReject;
    private _watchTasks;
    /**
     * Create a WS client instance.
     *
     * @param protocol - Optional custom protocol definition. If omitted, `WSProtocol` is used.
     *
     * @example
     * ```ts
     * interface Events {
     *  getState: { state: string },
     *  message: { msg: string }
     * }
     * const wsc = new WSClient<Events>()
     * ```
     */
    constructor(protocol?: Protocol);
    private _buildProxyProtocal;
    private _createConnectPromise;
    private _createContext;
    private _attemptConnect;
    private _scheduleReconnect;
    private _assertRPCProtocol;
    private _sendWithMiddleware;
    private _mergeSendMiddleware;
    private _subscribeEventWithMiddleware;
    private _mergeEventMiddleware;
    private _matchEvent;
    private _getEvent;
    private _applyStreamMiddleware;
    private _mergeStreamMiddleware;
    private _resolveSubscribe;
    private _createStreamTask;
    private _subsSignal;
    private _registerWatchTask;
    private _restoreWatchTasks;
    /**
     * Create a client instance that "takes over" an existing WebSocket.
     *
     * This is useful when the WebSocket is created elsewhere (for example by
     * a different library or a framework-managed connection), but you still want
     * to use the WSProxy features and middleware pipeline.
     *
     * @param ws - Existing WebSocket instance to bind.
     * @param protocol - Optional custom protocol definition.
     * @returns A WSClient bound to the provided WebSocket.
     */
    static takeover<Events extends AnyRecord = AnyRecord>(ws: WebSocket, protocol?: Protocol): WSClient<Events>;
    /**
     * Register global message middleware.
     *
     * Middleware runs for all event messages and can transform payloads, attach
     * metadata, or short-circuit handler execution via `ctx.stop()`.
     *
     * @param middlewares - A middleware or list of middlewares to append.
     *
     * @example
     * ```ts
     * client.use(async (ctx, next) => {
     *   ctx.meta = { ...ctx.meta, traceId: 'abc' }
     *   await next()
     * })
     * ```
     */
    use(middlewares: Middleware<any, Events> | Middleware<any, Events>[]): void;
    /**
     * Register global send middleware.
     *
     * Send middleware runs before a message is sent, and can mutate the outgoing
     * payload or stop the send by calling `ctx.stop()`.
     *
     * @param middlewares - A send middleware or list of send middlewares to append.
     *
     * @example
     * ```ts
     * client.useSend(async (ctx, next) => {
     *   ctx.data = { ...ctx.data, token: 'xxx' }
     *   await next()
     * })
     * ```
     */
    useSend(middlewares: SendMiddleware<any, Events> | SendMiddleware<any, Events>[]): void;
    /**
     * Register global stream middleware used by `watch`.
     *
     * Stream middleware can wrap or replace the `StreamTask` before it starts,
     * enabling behaviors like throttling, batching, or custom queue strategies.
     *
     * @param middlewares - A stream middleware or list of stream middlewares.
     *
     * @example
     * ```ts
     * client.useStream((task, ctx, next) => {
     *   // Replace the task with a custom wrapper if needed
     *   return next(task)
     * })
     * ```
     */
    useStream(middlewares: StreamMiddleware<any, Events> | StreamMiddleware<any, Events>[]): void;
    /**
     * Register event-route-specific middleware.
     *
     * The matcher can be a string, RegExp, or predicate function. When a routed
     * event matches, the provided middlewares are added to the pipeline.
     *
     * @param matcher - Event matcher (string | RegExp | predicate).
     * @param middlewares - Middleware(s) to apply for matched events.
     *
     * @example
     * ```ts
     * client.useEvent(/^chat:/, async (ctx, next) => {
     *   ctx.meta = { ...ctx.meta, room: 'public' }
     *   await next()
     * })
     * ```
     */
    useEvent(matcher: EventMatcher, middlewares: Middleware<any, Events> | Middleware<any, Events>[]): void;
    /**
     * Connect to a WebSocket server and initialize the proxy pipeline.
     *
     * Calling `connect` while already connecting/open will return the same
     * in-flight promise.
     *
     * @param url - WebSocket URL (ws:// or wss://).
     * @returns A promise that resolves once the connection is open.
     *
     * @example
     * ```ts
     * await client.connect('wss://example.com/ws')
     * ```
     */
    connect(url: string): Promise<void>;
    /**
     * Close the current WebSocket connection and reset connection state.
     *
     * This will prevent automatic reconnect attempts until `connect` is called again.
     *
     * @example
     * ```ts
     * client.close()
     * ```
     */
    close(): void;
    /**
     * Send a one-way message.
     *
     * Waits for the connection to be open before sending. No response is
     * expected.
     *
     * @param message - Message payload to send.
     * @param options - Optional per-send middleware configuration.
     *
     * @example
     * ```ts
     * await client.send({ type: 'ping' })
     * await client.send(
     *   { type: 'ping' },
     *   { sendMiddleware: [async (ctx, next) => { ctx.data.ts = Date.now(); await next() }] }
     * )
     * ```
     */
    send<Msg = any>(message: Msg, options?: WSSendOptions<Msg, Events>): Promise<void>;
    /**
     * Send a request and await a response (RPC style).
     *
     * Requires protocol to provide `getRequestId` and `getResponseId` so the
     * proxy can correlate replies.
     *
     * @param message - Request payload to send.
     * @param options - Optional per-send middleware configuration.
     * @returns A promise resolving to the response payload.
     *
     * @example
     * ```ts
     * const res = await client.request<{ type: string }, { ok: boolean }>({ type: 'get' })
     * console.log(res) // { ok: true }
     * ```
     */
    request<Msg = any, Receive = any>(message: Msg, options?: WSSendOptions<Msg, Events>): Promise<Receive>;
    /**
     * Associate an event name with a RouteRule.
     *
     * This is typically used internally to map string event names to route rules
     * resolved by the protocol.
     *
     * @param rules - RouteRule to associate.
     * @param event - Event name to map.
     * @returns The original RouteRule.
     *
     * @example
     * ```ts
     * const rule = client.withEvent(
     *   {
     *    event: 'chat:message',
     *    message: 'hello!'
     *   },
     *   'chat:message'
     * )
     * ```
     */
    withEvent<Receive = any>(rules: RouteRule<Receive>, event: string): RouteRule<Receive>;
    /**
     * Subscribe to one or more events by name.
     *
     * Uses the protocol to resolve event names to route rules, then applies
     * middleware and registers the handler.
     *
     * @param event - Event name or list of event names.
     * @param handler - Handler invoked for each matched message.
     * @param options - Optional subscription options and middleware overrides.
     * @returns An unsubscribe function.
     *
     * @example
     * ```ts
     * // `on` uses protocol.resolveEventType under the hood.
     * // Make sure your protocol defines resolveEventType for the event names.
     * client.on('chat:message', (data) => {
     *   console.log(data.text)
     * }) // it'll match the event like { type: 'chat:message' }
     * ```
     */
    on<Type extends Extract<keyof Events, string>>(event: Type | Type[], handler: WSHandler<Events[Type], Events>, options?: WSSubscribeOptions<Events[Type], Events>): () => void;
    /**
     * Subscribe to one or more events and auto-unsubscribe after first match.
     *
     * @param event - Event name or list of event names.
     * @param handler - Handler invoked for the first matched message.
     * @param options - Optional subscription options and middleware overrides.
     * @returns A promise resolving with the first received payload.
     *
     * @example
     * ```ts
     * const first = await client.once('chat:message', (data) => {
     *   console.log('first message', data)
     * })
     * console.log('resolved with', first)
     * ```
     */
    once<Type extends Extract<keyof Events, string>>(event: Type | Type[], handler: WSHandler<Events[Type], Events>, options?: WSSubscribeOptions<Events[Type], Events>): Promise<Events[Type]>;
    /**
     * Subscribe using an explicit route rule.
     *
     * @param rules - Route rule that matches incoming messages and supports predicate matching.
     * @param handler - Handler invoked for each matched message.
     * @param options - Optional subscription options and middleware overrides.
     * @returns An unsubscribe function.
     *
     * @example
     * ```ts
     * const rule = {
     *  type: 'chat:message',
     *  message: (value, e) => value === 'hello!'
    *  }
     *
     * // If you want the rule to match useEvent middlewares,
     * // register the mapping via withEvent.
     * client.withEvent(rule, 'chat:message')
     *
     * client.subscribe(rule, (data) => {
     *   console.log(data.text)
     * })
     * ```
     */
    subscribe<Reveive = any>(rules: RouteRule<Reveive>, handler: WSHandler<Reveive, Events>, options?: WSSubscribeOptions<Reveive, Events>): () => boolean;
    /**
     * Alias of `subscribe` for semantic clarity.
     *
     * @param rules - Route rule that matches incoming messages.
     * @param handler - Handler invoked for each matched message.
     * @param options - Optional subscription options and middleware overrides.
     * @returns An unsubscribe function.
     *
     * @example
     * ```ts
     * const rule = client.withEvent({ event: 'chat:message' }, 'chat:message')
     * client.subscribeEvent(rule, (data) => {
     *   console.log(data.text)
     * })
     * ```
     */
    subscribeEvent<Receive = any>(rules: RouteRule<Receive>, handler: WSHandler<Receive, Events>, options?: WSSubscribeOptions<Receive, Events>): () => boolean;
    /**
     * Send a command and stream the resulting event(s) through a StreamTask.
     *
     * This starts the stream, sends the command, and registers the task for
     * automatic restart on reconnect. Optionally supports an abort signal to stop
     * the task.
     *
     * @param command - Command payload to send.
     * @param eventOrRule - Event name or route rule to subscribe to.
     * @param options - Stream/watch options including queue strategy and middleware.
     * @returns A StreamTask that can be iterated or subscribed to.
     *
     * @example
     * ```ts
     * // Start a stream and read results with async iteration
     * const task = client.watch(
     *   { type: 'chat:history' },
     *   'chat:message',
     *   { maxQueueSize: 50, strategy: 'drop-head' }
     * )
     *
     * for await (const msg of task) {
     *   console.log(msg)
     * }
     * ```
     */
    watch<Receive = any>(command: AnyRecord, eventOrRule: Extract<keyof Events, string> | RouteRule<Receive>, options?: WSWatchOptions<Receive, Events>): StreamTask<Receive, Events>;
    /**
     * Get the underlying WebSocket instance.
     *
     * @returns The current WebSocket instance or `null` if not connected.
     */
    getWsInstance(): WebSocket | null;
    /**
     * Get the WSProxy instance used by this client.
     *
     * @returns The WSProxy instance.
     */
    getWsProxyInstance(): WSProxy<any, any, any>;
}
//# sourceMappingURL=ws.d.ts.map