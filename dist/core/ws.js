import { StreamTask } from './stream-task';
import { WSProxy } from 'ws-event-proxy';
import { WSProtocol } from './protocol';
import { composeMiddleware, composeStreamMiddleware } from './compose';
export var WSState;
(function (WSState) {
    WSState["IDLE"] = "IDLE";
    WSState["CONNECTING"] = "CONNECTING";
    WSState["OPEN"] = "OPEN";
    WSState["RECONNECTING"] = "RECONNECTING";
    WSState["CLOSED"] = "CLOSED";
})(WSState || (WSState = {}));
async function createWebSocket(url) {
    if (typeof window === 'undefined') {
        const { default: WS } = await import('ws');
        return new WS(url);
    }
    return new WebSocket(url);
}
export class WSClient {
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
    constructor(protocol) {
        this._ws = null;
        this._middlewares = [];
        this._sendMiddlewares = [];
        this._streamMiddlewares = [];
        this._eventRouteMiddlewares = [];
        this._eventMap = new WeakMap();
        this._state = WSState.IDLE;
        this._manualClose = false;
        this._url = null;
        this._connectResolve = null;
        this._connectReject = null;
        this._watchTasks = new Set();
        this._wsContext = this._createContext();
        this._connected = this._createConnectPromise();
        this._wsProtocal = protocol || WSProtocol;
        this._proxyProtocol = this._buildProxyProtocal(this._wsProtocal);
        this._wsProxy = new WSProxy(this._proxyProtocol);
    }
    _buildProxyProtocal(protocol) {
        return {
            ...WSProtocol.proxy,
            ...(protocol?.proxy || {}),
        };
    }
    _createConnectPromise() {
        return new Promise((resolve, reject) => {
            this._connectResolve = resolve;
            this._connectReject = reject;
        });
    }
    _createContext() {
        return {
            use: this.use.bind(this),
            useSend: this.useSend.bind(this),
            useStream: this.useStream.bind(this),
            useEvent: this.useEvent.bind(this),
            connect: this.connect.bind(this),
            close: this.close.bind(this),
            send: this.send.bind(this),
            request: this.request.bind(this),
            withEvent: this.withEvent.bind(this),
            on: this.on.bind(this),
            once: this.once.bind(this),
            subscribe: this.subscribe.bind(this),
            subscribeEvent: this.subscribeEvent.bind(this),
            watch: this.watch.bind(this)
        };
    }
    async _attemptConnect() {
        if (this._manualClose || !this._url)
            return;
        try {
            this._ws = await createWebSocket(this._url);
            const handleOpen = () => {
                this._state = WSState.OPEN;
                this._wsProxy.bind(this._ws);
                this._restoreWatchTasks();
                this._connectResolve?.();
                this._connectResolve = null;
                this._connectReject = null;
            };
            const handleReconnect = () => {
                if (this._manualClose)
                    return;
                this._ws = null;
                this._scheduleReconnect();
            };
            this._ws.addEventListener('open', handleOpen, { once: true });
            this._ws.addEventListener('error', handleReconnect);
            this._ws.addEventListener('close', handleReconnect);
        }
        catch (e) {
            this._state = WSState.CLOSED;
            this._connectReject?.(e);
            this._connectResolve = null;
            this._connectReject = null;
        }
    }
    _scheduleReconnect() {
        if (this._state === WSState.RECONNECTING)
            return;
        if (!this._url)
            return;
        this._state = WSState.RECONNECTING;
        this._connected = this._createConnectPromise();
        setTimeout(() => {
            this._attemptConnect();
        }, this._wsProtocal.reconnectTimeout);
    }
    _assertRPCProtocol(payload) {
        const protocol = this._proxyProtocol;
        if (!protocol.getRequestId?.(payload)) {
            throw new Error('[WebsocketWithProxy] request() requires protocol.getRequestId and protocol.getResponseId');
        }
    }
    async _sendWithMiddleware(message, expectResponse = true, options) {
        const middleware = this._mergeSendMiddleware(options);
        const pipeline = composeMiddleware(middleware);
        let stopped = false;
        const ctx = {
            data: message,
            raw: message,
            proxy: this._wsProxy,
            ws: this._ws,
            state: this._state,
            ctx: this._wsContext,
            meta: { expectResponse },
            stop: () => {
                stopped = true;
            }
        };
        await pipeline(ctx);
        if (stopped)
            return;
        return this._wsProxy.send(ctx.data, { expectResponse });
    }
    _mergeSendMiddleware(options) {
        const local = options?.sendMiddleware || [];
        if (options?.overrideSendMiddleware) {
            return local;
        }
        return [...this._sendMiddlewares, ...local];
    }
    _subscribeEventWithMiddleware(rules, handler, options) {
        const middleware = this._mergeEventMiddleware(rules, options);
        const pipeline = composeMiddleware(middleware);
        return this._wsProxy.subscribeEvent(rules, async (data) => {
            const ctx = {
                data,
                raw: data,
                event: rules,
                proxy: this._wsProxy,
                ws: this._ws,
                state: this._state,
                ctx: this._wsContext,
                meta: {}
            };
            let stopped = false;
            ctx.stop = () => {
                stopped = true;
            };
            await pipeline(ctx);
            if (!stopped)
                handler(ctx.data, this._wsContext);
        });
    }
    _mergeEventMiddleware(rule, options) {
        const global = this._middlewares;
        const local = options?.eventMiddleware || [];
        const event = this._getEvent(rule);
        const route = this._eventRouteMiddlewares
            .filter(r => this._matchEvent(event, r.matcher))
            .flatMap(r => r.middlewares);
        if (options?.overrideEventMiddleware) {
            return [...route, ...local];
        }
        return [...global, ...route, ...local];
    }
    _matchEvent(event, matcher) {
        if (!event)
            return false;
        if (typeof matcher === 'string') {
            return matcher === event;
        }
        if (matcher instanceof RegExp) {
            return matcher.test(event);
        }
        if (matcher instanceof Function) {
            return matcher(event);
        }
        return false;
    }
    _getEvent(rules) {
        return this._eventMap.get(rules);
    }
    _applyStreamMiddleware(task, command, eventOrRule, options) {
        const ctx = {
            task,
            command,
            eventOrRule,
            options,
            wsContext: this._wsContext
        };
        const middlewares = this._mergeStreamMiddleware(options);
        const pipeline = composeStreamMiddleware(middlewares);
        return pipeline(task, ctx);
    }
    _mergeStreamMiddleware(options) {
        const local = options?.streamMiddleware || [];
        if (options?.overrideStreamMiddleware) {
            return local;
        }
        return [...this._streamMiddlewares, ...local];
    }
    _resolveSubscribe(eventOrRule, options) {
        if (typeof eventOrRule === 'string') {
            return (handler) => this.on(eventOrRule, handler, options);
        }
        return (handler) => this.subscribe(eventOrRule, handler, options);
    }
    _createStreamTask(subscribe, options) {
        return new StreamTask(subscribe, {
            maxQueueSize: options?.maxQueueSize,
            strategy: options?.strategy
        });
    }
    _subsSignal(task, options) {
        if (!options?.signal)
            return () => { };
        return this.subscribe(options.signal, () => {
            task.stop();
        });
    }
    _registerWatchTask(record) {
        this._watchTasks.add(record);
        record.task.onStop(() => {
            this._watchTasks.delete(record);
            record.unsubsSignal?.();
        });
    }
    _restoreWatchTasks() {
        this._watchTasks.forEach(watchTask => {
            const { command, task } = watchTask;
            task.restart();
            this.send(command);
        });
    }
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
    static takeover(ws, protocol) {
        const instance = new WSClient(protocol);
        instance._ws = ws;
        instance._wsProxy.bind(ws);
        instance._state = WSState.OPEN;
        instance._connected = Promise.resolve();
        instance._manualClose = false;
        instance._url = null;
        return instance;
    }
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
    use(middlewares) {
        middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];
        this._middlewares.push(...middlewares);
    }
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
    useSend(middlewares) {
        middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];
        this._sendMiddlewares.push(...middlewares);
    }
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
    useStream(middlewares) {
        middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];
        this._streamMiddlewares.push(...middlewares);
    }
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
    useEvent(matcher, middlewares) {
        middlewares = Array.isArray(middlewares) ? middlewares : [middlewares];
        this._eventRouteMiddlewares.push({ matcher, middlewares });
    }
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
    async connect(url) {
        if (this._state === WSState.OPEN)
            return this._connected;
        if (this._state === WSState.CONNECTING)
            return this._connected;
        this._url = url;
        this._manualClose = false;
        this._state = WSState.CONNECTING;
        this._attemptConnect();
        return this._connected;
    }
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
    close() {
        this._manualClose = true;
        this._ws?.close();
        this._ws = null;
        this._state = WSState.CLOSED;
        this._connected = this._createConnectPromise();
    }
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
    async send(message, options) {
        await this._connected;
        await this._sendWithMiddleware(message, false, options);
    }
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
    async request(message, options) {
        this._assertRPCProtocol(message);
        await this._connected;
        return this._sendWithMiddleware(message, true, options);
    }
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
    withEvent(rules, event) {
        this._eventMap.set(rules, event);
        return rules;
    }
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
    on(event, handler, options) {
        if (!this._wsProtocal.resolveEventType) {
            throw new Error('[WebsocketWithProxy] on() requires protocol.resolveEventType');
        }
        const events = Array.isArray(event) ? event : [event];
        if (events.length === 0) {
            throw new Error('[WebsocketWithProxy] on() requires at least one event');
        }
        const unsubscribers = events
            .map(e => this.withEvent(this._wsProtocal.resolveEventType(e), e))
            .map(rule => this._subscribeEventWithMiddleware(rule, handler, options));
        return () => {
            unsubscribers.forEach(unsubscribe => unsubscribe());
        };
    }
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
    once(event, handler, options) {
        return new Promise(resolve => {
            const off = this.on(event, (data, ctx) => {
                handler(data, ctx);
                off();
                resolve(data);
            }, options);
        });
    }
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
    subscribe(rules, handler, options) {
        return this._subscribeEventWithMiddleware(rules, handler, options);
    }
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
    subscribeEvent(rules, handler, options) {
        return this.subscribe(rules, handler, options);
    }
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
    watch(command, eventOrRule, options) {
        const subscribe = this._resolveSubscribe(eventOrRule, options);
        let task = this._createStreamTask(subscribe, options);
        task = this._applyStreamMiddleware(task, command, eventOrRule, options);
        const unsubsSignal = this._subsSignal(task, options);
        task.start();
        this.send(command);
        this._registerWatchTask({ command, task, unsubsSignal });
        return task;
    }
    /**
     * Get the underlying WebSocket instance.
     *
     * @returns The current WebSocket instance or `null` if not connected.
     */
    getWsInstance() {
        return this._ws;
    }
    /**
     * Get the WSProxy instance used by this client.
     *
     * @returns The WSProxy instance.
     */
    getWsProxyInstance() {
        return this._wsProxy;
    }
}
//# sourceMappingURL=ws.js.map