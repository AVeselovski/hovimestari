import { useState } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Mic } from "lucide-react";
import type { RecipeDraft } from "@hovi/shared";
import { importRecipeFromText, RecipeImportError } from "../lib/api.js";

type Mode = "menu" | "text";

export function RecipeImportSheet({
  onDraft,
  onBlank,
  onCancel,
}: {
  onDraft: (draft: RecipeDraft, warnings: string[]) => void;
  onBlank: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [mode, setMode] = useState<Mode>("menu");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (text.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importRecipeFromText(text);
      onDraft(res.draft, res.warnings);
    } catch (err) {
      if (err instanceof RecipeImportError && err.status === 0) {
        setError("Yhteysvirhe");
      } else if (err instanceof RecipeImportError && err.status === 503) {
        setError("AI-tuontia ei ole määritetty");
      } else {
        setError("AI-tuonti epäonnistui — kokeile uudelleen");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "var(--paper)" }}
    >
      <header
        className="px-5 py-4 flex items-center justify-between border-b"
        style={{ borderColor: "var(--rule)" }}
      >
        <button
          onClick={mode === "menu" ? onCancel : () => setMode("menu")}
          className="flex items-center gap-1 text-sm"
          style={{ color: "var(--ink)" }}
        >
          <ArrowLeft size={16} /> Takaisin
        </button>
        <p className="font-display text-lg">Tuo resepti</p>
        <div className="w-16" />
      </header>

      {mode === "menu" && (
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-3">
          <ImportButton
            icon={<FileText size={18} />}
            label="Kirjoita / liitä"
            onClick={() => setMode("text")}
          />
          <ImportButton
            icon={<ImageIcon size={18} />}
            label="Kuva"
            disabled
            badge="tulossa"
          />
          <ImportButton
            icon={<Mic size={18} />}
            label="Ääni"
            disabled
            badge="tulossa"
          />

          <button
            onClick={onBlank}
            className="block mx-auto mt-8 text-sm underline"
            style={{ color: "var(--muted)" }}
          >
            tai aloita tyhjästä
          </button>
        </div>
      )}

      {mode === "text" && (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Liitä resepti tekstinä. AI tunnistaa nimen, ajan, annokset ja
            ainekset — voit tarkistaa tulokset ennen tallennusta.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            rows={14}
            placeholder={
              "Esim. Jauheliha-tomaattipasta, 20 min, 4 annosta.\nNaudan jauheliha 400g, pasta 400g, tomaattimurska 1 tlk..."
            }
            className="w-full px-3 py-2.5 rounded-lg border bg-transparent text-sm"
            style={{ borderColor: "var(--rule)", fontFamily: "inherit" }}
          />
          {error !== null && (
            <p
              className="text-sm px-3 py-2 rounded border"
              style={{
                borderColor: "var(--berry)",
                color: "var(--berry)",
                background: "var(--paper-2)",
              }}
            >
              {error}
            </p>
          )}
          <button
            onClick={() => {
              void submit();
            }}
            disabled={loading || text.trim().length === 0}
            className="w-full text-sm px-3 py-2.5 rounded-full flex items-center justify-center gap-2"
            style={{
              background:
                loading || text.trim().length === 0
                  ? "var(--rule)"
                  : "var(--ink)",
              color: "var(--paper)",
            }}
          >
            {loading ? (
              <>
                <Spinner /> Tuodaan…
              </>
            ) : (
              "Tuo"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ImportButton({
  icon,
  label,
  onClick,
  disabled,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border text-left"
      style={{
        borderColor: "var(--rule)",
        background: "var(--paper-2)",
        color: disabled ? "var(--muted)" : "var(--ink)",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <span style={{ color: disabled ? "var(--muted)" : "var(--ink)" }}>
        {icon}
      </span>
      <span className="flex-1 font-display text-base">{label}</span>
      {badge !== undefined && (
        <span
          className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full"
          style={{
            background: "var(--rule)",
            color: "var(--ink)",
            letterSpacing: "0.15em",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Spinner(): JSX.Element {
  return (
    <span
      aria-label="ladataan"
      className="inline-block w-3.5 h-3.5 rounded-full border-2 border-transparent animate-spin"
      style={{
        borderTopColor: "var(--paper)",
        borderRightColor: "var(--paper)",
      }}
    />
  );
}
