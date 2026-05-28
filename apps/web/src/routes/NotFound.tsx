import { Link } from "react-router-dom";

export function NotFound(): JSX.Element {
  return (
    <div className="text-center mt-16 space-y-3">
      <p className="font-display text-2xl">Reseptiä ei löytynyt.</p>
      <Link
        to="/recipes"
        className="inline-block text-sm underline"
        style={{ color: "var(--muted)" }}
      >
        Takaisin reseptilistaan
      </Link>
    </div>
  );
}
