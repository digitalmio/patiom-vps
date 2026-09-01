import {
	createStartHandler,
	defaultStreamHandler,
} from "@tanstack/react-start/server";
import { requestContext } from "@/lib/request-context";

// RequestHandler's public type omits the (request, env, ctx) the workerd
// runtime actually passes through — the default entry never re-calls it.
const startFetch = createStartHandler(defaultStreamHandler) as (
	request: Request,
	env: Env,
	ctx: ExecutionContext,
) => Promise<Response>;

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return requestContext.run({ env }, () => startFetch(request, env, ctx));
	},
};
