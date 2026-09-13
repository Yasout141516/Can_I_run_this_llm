import { Link, NavLink } from "react-router-dom";

const ITEMS = [
  // `end` only on "/" — without it NavLink treats every path as a descendant
  // of the index route and lights Home up everywhere.
  { to: "/", label: "Home", end: true },
  { to: "/browse", label: "Browse LLMs", end: false },
  { to: "/benchmarks", label: "Benchmarks", end: false },
  { to: "/calculator", label: "Check my hardware", end: false },
];

/**
 * The wordmark is a link, not a heading: home owns the only <h1>, and a nav
 * that ships its own would give every page two top-level headings.
 */
export function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <Link className="brand" to="/">
        Runcheck
      </Link>
      <ul className="nav-links">
        {ITEMS.map(({ to, label, end }) => (
          <li key={to}>
            <NavLink className="nav-link" to={to} end={end}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
