export const composeMiddleware = (middlewares) => {
    return async (ctx) => {
        let index = -1;
        const dispatch = async (i) => {
            if (i <= index)
                return Promise.reject(new Error('next() called multiple times'));
            index = i;
            const fn = middlewares[i];
            if (!fn)
                return;
            await fn(ctx, () => dispatch(i + 1));
        };
        await dispatch(0);
    };
};
export const composeStreamMiddleware = (middlewares) => {
    return (task, ctx) => {
        let index = -1;
        const dispatch = (i, currentTask) => {
            if (i <= index) {
                throw new Error('next() called multiple times');
            }
            index = i;
            const fn = middlewares[i];
            if (!fn)
                return currentTask;
            return fn(currentTask, ctx, (nextTask) => dispatch(i + 1, nextTask ?? currentTask));
        };
        return dispatch(0, task);
    };
};
//# sourceMappingURL=compose.js.map