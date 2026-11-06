<div align="center">
  <img src="logo/logo.png" alt="Xeno.JS Logo" width="140" />

  <h1>Xeno.JS Vercel</h1>
  <p><strong>A Typescript application framework architecture for Node.js, designed for lower technical debt, and faster infrastructure migrations.</strong></p>
  <p>Build long-lived applications with explicit dependency injection, DDD, CQRS, and transport-independent business logic.</p>

  <p>
    <a href="https://www.npmjs.com/package/@xeno-js/vercel"><img src="https://img.shields.io/npm/v/@xeno-js/vercel?style=flat-square" alt="NPM Version" /></a>
    <a href="https://github.com/xeno-js/vercel"><img src="https://img.shields.io/badge/Powered%20by-Xeno-blueviolet?style=flat-square" alt="Powered by Xeno" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" /></a>
    <a href="https://buymeacoffee.com/xenojs">
      <img src="https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-FFdd00?style=flat-square&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee" />
    </a>
  </p>
</div>

---

`@xeno-js/vercel` provides native integration for deploying Xeno.JS Backend-for-Frontend (BFF) applications as Vercel Serverless Functions. It maps Vercel request/response lifecycles directly into the framework's transport-independent execution pipelines.

## Installation

```bash
npm install @xeno-js/vercel
```

The package requires Node.js 20 or higher, `@xeno-js/core` as peer dependencies.

---

## 1. Setting Up the Application Bootstrap Container

**Problem.** Serverless functions require cold-start optimization to avoid bootstrapping application modules on every single incoming HTTP request.

**Principle.** Application container initialization must be lazy-loaded, cached as a singleton instance across function invocations, and cleanly decoupled from the serverless transport entry point.

**Mechanism.** The `getApp` utility ensures the Xeno.JS application container is bootstrapped precisely once during the initial cold start and securely reused for subsequent warm requests.

**Implementation:**

```ts
// _lib/app.ts
import { Guards, IXenoApplication, Maybe } from '@xeno-js/core'
import { MyRegistry } from './registry.js'
import { bootstrap } from './bootstrap.js'

let cachedApp: Maybe<IXenoApplication<MyRegistry>> = null

export async function getApp() {
  if (!Guards.isDefined(cachedApp)) {
    cachedApp = await bootstrap()
  }
  return cachedApp
}
```

**Behavior:** During the first execution, `bootstrap()` wires routes, middlewares, CQRS pipelines, and DI containers. Subsequent requests instantly resolve the cached application instance.

**Boundary:** The application bootstrap handles infrastructure wiring and container configuration, remaining completely agnostic of the deployment host (Vercel, AWS, or bare-metal).

---

## 2. Registering Routes with `addRoutes`

**Problem.** An application container requires an explicit route registry mapping HTTP verbs and paths to their corresponding handlers. Without route definitions, the internal `RouteMatcher` cannot resolve incoming endpoints, resulting in a `404 Not Found` response.

**Principle.** Route registration must be explicitly defined using `addRoutes` during application building to bind endpoints to the dispatching pipeline.

**Mechanism.** The `addRoutes` method registers route definitions into the `XenoAppBuilder`, initializing the route matcher index.

**Implementation:**

```ts
// _lib/bootstrap.ts
import { XenoAppBuilder } from '@xeno-js/core';
import { routes } from './routes.js';
import type { MyRegistry } from './registry.js';

export async function bootstrap() {
    const builder = new XenoAppBuilder<MyRegistry>()
        .addRoutes(routes) // REQUIRED: Registers application routes
        // ... other modules and configurations
        
    return await builder.build();
}
```

**Behavior:** The router compiles patterns and methods during bootstrap so that incoming serverless requests can be efficiently matched and dispatched.

**Boundary:** Route definitions handle URL matching and parameter extraction, delegating business logic to controllers and handlers.

---

## 3. Configuring the Vercel Catch-All Serverless Handler

**Problem.** Vercel maps individual files inside an `api/` directory to distinct serverless endpoints, whereas modern BFFs typically rely on a unified internal router to handle complex nested sub-routes (e.g., `/api/v1/orders`).

**Principle.** All serverless traffic must be routed to a single catch-all entrypoint function that delegates request processing to the framework's internal `RouteMatcher` and `HttpDispatcher`.

**Mechanism.** The `XenoVercel.handle` utility adapts incoming `VercelRequest` and `VercelResponse` objects, executes the standard middleware chain, evaluates route policies, and formats the output response.

**Implementation:**

Assuming you place your serverless entry point inside a directory designated for deployment (for example, `api/index.ts` as an example directory layout), configure the handler as follows:

```ts
// api/index.ts (Catch-all serverless function entrypoint)
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ERROR_CODE_MESSAGES, ERROR_CODES, GuidHelper, STATUS_CODES } from "@xeno-js/core";
import { XenoVercel } from "@xeno-js/vercel";
import { getApp } from "./_lib/app.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
    try {
        return await XenoVercel.handle(req, res, getApp)
    } catch (error) {
        console.error('Fatal error in serverless runtime:', error)
        const isDev = process.env.NODE_ENV === 'development'
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
        
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: {
                code: ERROR_CODES.SYSTEM_ERROR,
                message: ERROR_CODE_MESSAGES[ERROR_CODES.SYSTEM_ERROR],
                details: isDev ? errorMessage : undefined,
                path: req.url,
            },
            correlationId: GuidHelper.generate(),
            requestId: GuidHelper.generate(),
            timestamp: new Date().toISOString(),
        })
    }
}
```

**Behavior:** When an HTTP request hits `https://your-domain.com/api/v1/orders`, Vercel rewrites or routes the call to `api/index.ts`. `XenoVercel.handle` matches the route, executes CORS, rate-limiting, authentication, and validation middleware, and invokes the target controller.

**Boundary:** The Vercel handler translates serverless transport boundaries into standard framework requests, keeping core controllers and use cases 100% portable.

---

## 4. Technical Documentation: Global Rate Limiting Error on Vercel / Reverse Proxy

### 1. Problem Description

During application execution (or during load testing with tools like k6), after a minimal number of requests (e.g., 10 requests), all users start receiving the following error:

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "errors.too_many_requests",
    "details": "Rate limit exceeded.",
    "path": "/api/v1/orders"
  }
}
```

The block occurs even when requests originate from different client IPs, different devices, or distinct users, rendering the service unusable for the entire global user base for the duration of the time window (`windowSeconds`).

### 2. Root Cause

In Xeno.JS, `RateLimitMiddleware` builds the counting cache key via `RateLimitKeyBuilder`:

```text
ratelimit:ip:<clientIp>:<resource>
```

Extracting `clientIp` is delegated to the `ClientIpResolver` service. In the Xeno.JS source code, the resolver operates as follows:

```typescript
export class ClientIpResolver implements IIPResolver {
  constructor(private readonly _trustedProxies: string[] = []) {}

  public resolve(req: XenoRequest, clientIp: Optional<string>): Optional<string> {
    const socketIp = req.socket?.remoteAddress
    if (!Guards.isDefined(socketIp))
      return !Guards.isNullOrEmpty(clientIp) ? clientIp.split(',')[0].trim() : undefined
    const isTrustedProxy = this._trustedProxies.includes(socketIp)
    if (!isTrustedProxy) return socketIp
    if (Guards.isDefined(clientIp)) return clientIp.split(',')[0].trim()
    return socketIp
  }
}
```

#### Why does collective blocking happen?

1. **TCP Connection on Serverless Platforms (Vercel):**  
   When a user sends a request to an application deployed on Vercel, they do not establish a direct TCP connection with the Serverless Function; they connect first to Vercel's Edge/Reverse Proxy infrastructure.
2. **Vercel Proxy to Container:**  
   The Vercel proxy then connects to the serverless container. Consequently, `req.socket.remoteAddress` contains the internal IP address of Vercel's proxy, not the real visitor's IP.
3. **Missing Trusted Proxies (`_trustedProxies` is empty):**  
   For security reasons (preventing IP spoofing), `ClientIpResolver` refuses to read headers such as `X-Forwarded-For` or `X-Real-IP` unless `req.socket.remoteAddress` matches the list of trusted proxies (`_trustedProxies`). If `trustedProxies` is unconfigured, `_trustedProxies` defaults to an empty array `[]`.
4. **Fallback to Socket IP:**  
   Because `isTrustedProxy` evaluates to `false`, the resolver returns `socketIp` directly. This means every request—regardless of the user originating it—is labeled with the identical internal Vercel IP.
5. **Bucket Saturation:**  
   All users share the exact same cache key (e.g., `ratelimit:ip:10.x.x.x:/api/v1/orders`). As soon as the first 10 aggregate requests worldwide are executed, the counter exceeds the threshold (`maxRequests: 10`), triggering the middleware for anyone else sending a request within the next 60 seconds.

### 3. Solution

To ensure each user receives an isolated request budget, configure `MiddlewareModule` to:

1. Recognize `x-forwarded-for` as the primary header for identifying the client.
2. Trust Vercel's reverse proxy by enabling the wildcard (`['*']`).

#### Bootstrap Configuration (`_lib/bootstrap.ts`)

Inside the `.addMiddlewares()` configuration:

```typescript
.addMiddlewares((opts, config) => {
    // 1. CORS Configuration
    opts.cors = {
        allowOrigins: [config.get('CLIENT_URL', '')!],
        enablePreflight: true,
        enabled: true
    };

    // 2. Instruct Xeno.JS to read the header injected by Vercel
    opts.trustedIpHeader = 'x-forwarded-for';

    // 3. Instruct the resolver to trust intermediate proxies
    // Without this, x-forwarded-for would be discarded in favor of req.socket.remoteAddress
    opts.trustedProxies = ['*'];

    // 4. Rate Limiting configuration per individual user IP
    opts.rateLimit = {
        enabled: true,
        maxRequests: 10,  // Maximum 10 requests per user/IP
        windowSeconds: 60 // 60-second time window
    };
})
```

### 4. Why This Configuration Is Mandatory

- **Cache Key Isolation:**  
  With `trustedProxies = ['*']`, `ClientIpResolver` extracts the first IP from the list present in the `X-Forwarded-For` header (the actual public IP address of the client that initiated the request).
- **Multi-User Operation:**  
  The generated cache keys will be unique per client:
  
  - User A: `ratelimit:ip:93.45.12.1:/api/v1/orders` (10 requests available).
  - User B: `ratelimit:ip:80.18.23.4:/api/v1/orders` (10 requests available).
  
  If User A exhausts their 10 requests and gets throttled with a `429 Too Many Requests`, User B can continue chatting freely without encountering any slowdowns or blocks.

---

## License

Released under the [MIT License](LICENSE).
