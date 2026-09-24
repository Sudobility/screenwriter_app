import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/** Bridges `building_blocks`' `href`-based link contract to `react-router`'s `to`-based `<Link>` (music_app's
 * `LinkWrapper.tsx` pattern) — needed because `Link` computes its own `href` from `to` via `useHref`, so a plain
 * `<a>` passed `href` wouldn't navigate through the router. */
export function LinkWrapper({ href, className, children, onClick }: { href: string; className?: string; children: ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <Link to={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
