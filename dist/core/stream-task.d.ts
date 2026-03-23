import type { AnyRecord, QueueStrategyFn, WSHandler } from '../types/ws';
interface WSStreamTaskOptions<Receive> {
    maxQueueSize?: number;
    strategy?: QueueStrategyFn<Receive> | keyof typeof builtInStrategies;
}
declare const builtInStrategies: {
    unbounded: <Receive>({ queue, incoming }: any) => any[];
    'drop-head': <Receive>({ queue, incoming, maxSize }: any) => any[];
    'drop-tail': <Receive>({ queue, incoming, maxSize }: any) => any;
};
export declare class StreamTask<Receive = any, Events extends AnyRecord = AnyRecord> {
    private _subscribe;
    private _unsubscribe?;
    private _handlers;
    private _stopHandlers;
    private _queue;
    private _resolvers;
    private _maxQueueSize?;
    private _strategy;
    private _ended;
    /**
     * Create a StreamTask for consuming a stream of messages.
     *
     * @param subscribe - Subscription function that registers a handler and
     * returns an unsubscribe function.
     * @param options - Queue and strategy configuration for buffering.
     *
     * @example
     * ```ts
     * const task = new StreamTask<MyMessage>((handler) => {
     *   const off = client.on('my:event', handler)
     *   return () => off()
     * })
     * task.start()
     * ```
     */
    constructor(subscribe: (handler: WSHandler<Receive, Events>) => () => void, options?: WSStreamTaskOptions<Receive>);
    private _push;
    /**
     * Create an async iterator over the streamed messages.
     *
     * Each `next()` resolves when a message is available or when the task ends.
     *
     * @example
     * ```ts
     * for await (const item of task) {
     *   console.log(item)
     * }
     * ```
     */
    [Symbol.asyncIterator](): {
        next: () => Promise<unknown>;
    };
    /**
     * Start the stream subscription.
     *
     * No-op if already started.
     *
     * @example
     * ```ts
     * task.start()
     * ```
     */
    start(): void;
    /**
     * Stop the stream subscription and end the iterator.
     *
     * Pending `next()` promises are resolved as done, the queue is cleared,
     * and stop handlers are invoked.
     *
     * @example
     * ```ts
     * task.stop()
     * ```
     */
    stop(): void;
    /**
     * Restart the stream subscription.
     *
     * Clears buffered items and resets the ended state.
     *
     * @example
     * ```ts
     * task.restart()
     * ```
     */
    restart(): void;
    /**
     * Register a handler invoked for each received message.
     *
     * @param handler - Callback invoked with data and context.
     * @returns An unsubscribe function for this handler.
     *
     * @example
     * ```ts
     * const off = task.onData((data) => console.log(data))
     * // later...
     * off()
     * ```
     */
    onData(handler: WSHandler<Receive, Events>): () => void;
    /**
     * Register a handler invoked when the task stops.
     *
     * @param handler - Callback invoked on stop.
     * @returns An unsubscribe function for this handler.
     *
     * @example
     * ```ts
     * const off = task.onStop(() => console.log('stopped'))
     * ```
     */
    onStop(handler: () => void): () => void;
    /**
     * Await the next item from the stream.
     *
     * @returns A promise that resolves with the next item or rejects if the task ended.
     *
     * @example
     * ```ts
     * const item = await task.next()
     * ```
     */
    next(): Promise<Receive>;
}
export {};
//# sourceMappingURL=stream-task.d.ts.map