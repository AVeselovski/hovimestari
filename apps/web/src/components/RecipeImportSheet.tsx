import { useRef, useState } from "react";
import { ArrowLeft, FileText, Image as ImageIcon, X } from "lucide-react";
import type { RecipeDraft, SupportedImageMediaType } from "@hovi/shared";
import {
  importRecipeFromImage,
  importRecipeFromText,
  RecipeImportError,
} from "../lib/api.js";
import {
  ImageTooLargeError,
  preprocessImage,
} from "../lib/imagePreprocess.js";

type Mode = "menu" | "text" | "image";

type PreparedImage = {
  blob: Blob;
  dataUrl: string;
  mediaType: SupportedImageMediaType;
  fileName: string;
};

export function RecipeImportSheet({
  onDraft,
  onBlank,
  onCancel,
}: {
  onDraft: (
    draft: RecipeDraft,
    warnings: string[],
    provider: string,
    model: string,
    confidence: number,
    fallback?: { provider: string; model: string; confidence: number },
  ) => void;
  onBlank: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [mode, setMode] = useState<Mode>("menu");
  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetImageState = (): void => {
    setImage(null);
    setError(null);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  };

  const submitText = async (): Promise<void> => {
    if (text.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importRecipeFromText(text);
      onDraft(res.draft, res.warnings, res.provider, res.model, res.confidence, res.fallback);
    } catch (err) {
      setError(mapImportError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const { blob, dataUrl } = await preprocessImage(file);
      setImage({
        blob,
        dataUrl,
        mediaType: "image/jpeg",
        fileName: file.name,
      });
    } catch (err) {
      if (err instanceof ImageTooLargeError) {
        setError("Kuva on liian iso");
      } else {
        setError("Kuvan käsittely epäonnistui");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitImage = async (): Promise<void> => {
    if (image === null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importRecipeFromImage(image.blob, image.mediaType);
      onDraft(res.draft, res.warnings, res.provider, res.model, res.confidence, res.fallback);
    } catch (err) {
      setError(mapImportError(err));
    } finally {
      setLoading(false);
    }
  };

  const onBack = (): void => {
    if (mode === "menu") {
      onCancel();
      return;
    }
    resetImageState();
    setMode("menu");
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
          onClick={onBack}
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
            onClick={() => {
              setMode("image");
              fileInputRef.current?.click();
            }}
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
          {error !== null && <ErrorBanner message={error} />}
          <button
            onClick={() => {
              void submitText();
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

      {mode === "image" && (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Valitse kuva reseptistä — kirjasta, kortilta tai paperilta. AI lukee
            tekstin ja luo luonnoksen, jonka voit tarkistaa.
          </p>

          {image === null && !loading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-sm px-3 py-2.5 rounded-full"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              Valitse kuva
            </button>
          )}

          {loading && image === null && (
            <p className="text-sm flex items-center gap-2" style={{ color: "var(--muted)" }}>
              <Spinner /> Käsitellään kuvaa…
            </p>
          )}

          {image !== null && (
            <div className="space-y-3">
              <div
                className="relative rounded-lg overflow-hidden border"
                style={{ borderColor: "var(--rule)" }}
              >
                <img
                  src={image.dataUrl}
                  alt={image.fileName}
                  className="w-full max-h-72 object-contain"
                  style={{ background: "var(--paper-2)" }}
                />
                <button
                  onClick={resetImageState}
                  aria-label="Poista kuva"
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "var(--paper)", color: "var(--ink)" }}
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {image.fileName}
              </p>
            </div>
          )}

          {error !== null && <ErrorBanner message={error} />}

          {image !== null && (
            <button
              onClick={() => {
                void submitImage();
              }}
              disabled={loading}
              className="w-full text-sm px-3 py-2.5 rounded-full flex items-center justify-center gap-2"
              style={{
                background: loading ? "var(--rule)" : "var(--ink)",
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
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) {
            void handleFile(file);
          }
        }}
      />
    </div>
  );
}

function mapImportError(err: unknown): string {
  if (err instanceof ImageTooLargeError) return "Kuva on liian iso";
  if (err instanceof RecipeImportError) {
    if (err.status === 0) return "Yhteysvirhe";
    if (err.status === 503) return "AI-tuontia ei ole määritetty";
    if (err.status === 400) {
      if (err.message.includes("image_too_large")) return "Kuva on liian iso";
      if (err.message.includes("unsupported_media_type"))
        return "Kuvatyyppi ei kelpaa";
    }
  }
  return "AI-tuonti epäonnistui — kokeile uudelleen";
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return (
    <p
      className="text-sm px-3 py-2 rounded border"
      style={{
        borderColor: "var(--berry)",
        color: "var(--berry)",
        background: "var(--paper-2)",
      }}
    >
      {message}
    </p>
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
