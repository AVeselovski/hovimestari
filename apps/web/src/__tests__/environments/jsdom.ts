// The default test environment: jsdom, plus the fetch classes every browser
// the app supports has and jsdom does not (Response, Request, Headers,
// AbortSignal.timeout). They are Node's own, so they behave as the platform's
// do. `fetch` itself is left out on purpose: a test that reaches the network
// must stub it, never call out.
import { TestEnvironment } from "jest-environment-jsdom";

type Config = ConstructorParameters<typeof TestEnvironment>[0];
type Context = ConstructorParameters<typeof TestEnvironment>[1];

export default class JsdomWithFetchClasses extends TestEnvironment {
  constructor(config: Config, context: Context) {
    super(config, context);
    const g = this.global as unknown as Record<string, unknown>;
    g.Response = Response;
    g.Request = Request;
    g.Headers = Headers;
    g.TextEncoder ??= TextEncoder;
  }
}
