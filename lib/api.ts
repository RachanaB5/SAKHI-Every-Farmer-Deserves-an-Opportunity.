// API plumbing shared by every route handler: the `{ ok, data | error }`
// envelope, typed errors, auth + role checks and Zod body/query parsing.
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { User } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/token";

/** Error with an HTTP status that route handlers can throw anywhere. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Success envelope. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

/** Failure envelope. */
export function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false as const, error, details }, { status });
}

type Ctx<P> = { params: Promise<P> };

interface HandlerOptions<B, Q> {
  /** Roles allowed to call the route. Omit for public routes; `[]` = any signed-in user. */
  roles?: Role[];
  body?: ZodType<B>;
  query?: ZodType<Q>;
}

interface HandlerArgs<B, Q, P, U> {
  req: NextRequest;
  params: P;
  body: B;
  query: Q;
  user: U;
}

/**
 * Wraps a route handler with auth, role check, Zod validation and
 * consistent error responses.
 * @param opts - roles plus optional body/query schemas
 * @param fn - business logic; return a value (wrapped in `ok`) or a Response
 * @returns a Next.js route handler
 */
export function handler<B = undefined, Q = undefined, P = Record<string, string>>(
  opts: HandlerOptions<B, Q> & { roles: Role[] },
  fn: (args: HandlerArgs<B, Q, P, User>) => Promise<unknown>,
): (req: NextRequest, ctx: Ctx<P>) => Promise<Response>;
export function handler<B = undefined, Q = undefined, P = Record<string, string>>(
  opts: HandlerOptions<B, Q>,
  fn: (args: HandlerArgs<B, Q, P, User | null>) => Promise<unknown>,
): (req: NextRequest, ctx: Ctx<P>) => Promise<Response>;
export function handler<B, Q, P>(
  opts: HandlerOptions<B, Q>,
  // Typed with a non-null user so both overloads are assignable; the null
  // case only reaches handlers that declared no roles (second overload).
  fn: (args: HandlerArgs<B, Q, P, User>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (opts.roles) {
        if (!user) throw new HttpError(401, "Please sign in to continue");
        if (opts.roles.length > 0 && !opts.roles.includes(user.role as Role)) {
          throw new HttpError(403, "Your account type can't do that");
        }
      }
      let body = undefined as B;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw new HttpError(400, "Request body must be JSON");
        }
        body = opts.body.parse(raw);
      }
      let query = undefined as Q;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      }
      const params = (ctx?.params ? await ctx.params : {}) as P;
      const result = await fn({ req, params, body, query, user: user as User });
      if (result instanceof Response) return result;
      return ok(result ?? null);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Maps thrown errors to the failure envelope. */
export function toErrorResponse(err: unknown) {
  if (err instanceof HttpError) return fail(err.status, err.message, err.details);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return fail(400, `${where}${first?.message ?? "Invalid input"}`, err.issues);
  }
  console.error("[api] unhandled error", err);
  return fail(500, "Something went wrong on our side. Please try again.");
}

/** Throws 404 when a record is missing; narrows the type otherwise. */
export function must<T>(value: T | null | undefined, message = "Not found"): T {
  if (value === null || value === undefined) throw new HttpError(404, message);
  return value;
}
