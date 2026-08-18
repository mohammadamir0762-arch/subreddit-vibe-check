import type { Plugin } from 'vite';
import type { RouteResult } from '../api/_lib/handlers.ts';

/**
 * Serves the `/api` routes during `npm run dev`.
 *
 * Vercel serverless functions don't run under `vite dev`, which normally forces
 * contributors to install the Vercel CLI just to click around locally. Mounting the
 * same route functions as Vite middleware means a plain `npm install && npm run dev`
 * is a complete local setup, running the identical code path production runs.
 *
 * Handlers are pulled in through `ssrLoadModule` at request time rather than as a
 * static import. That keeps the Vercel-bound files in `api/` out of the Vite config's
 * module graph — so they can keep the extensionless imports Vercel's bundler expects —
 * and it re-evaluates them on every request, so editing a route hot-reloads.
 */

type RouteName = 'hotRoute' | 'searchRoute';

const ROUTES: Record<string, RouteName> = {
  '/api/hot': 'hotRoute',
  '/api/search': 'searchRoute',
};

export function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const routeName = ROUTES[url.pathname];
        if (!routeName) return next();

        try {
          const module = (await server.ssrLoadModule('/api/_lib/handlers.ts')) as Record<
            RouteName,
            (params: URLSearchParams) => Promise<RouteResult>
          >;
          const { status, body, cacheControl } = await module[routeName](url.searchParams);

          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', cacheControl);
          res.end(JSON.stringify(body));
        } catch (error) {
          console.error('[dev-api]', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Dev API failure.', hint: 'See the terminal for the stack trace.' }));
        }
      });
    },
  };
}
