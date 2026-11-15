import { standaloneLinkClass } from "@/components/ui/styles";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactElement } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notFound");
  return { title: t("title") };
}

/** An address with no page. Rendered on the server, in the guest frame's shape. */
export default async function NotFound(): Promise<ReactElement> {
  const t = await getTranslations("notFound");
  const tCommon = await getTranslations("common");
  return (
    <main className="mx-auto min-h-dvh w-full max-w-auth bg-bg px-4 pt-[calc(var(--safe-top)+2.5rem)] pb-[calc(var(--safe-bottom)+2rem)] md:pt-24">
      <p className="font-display text-2xl font-semibold tracking-tight text-ink">{tCommon("appName")}</p>
      <div className="mt-2 mb-8 rule-dashed" />
      <h1 className="mb-4 font-display text-title font-medium text-ink md:text-title-lg">{t("title")}</h1>
      <p className="mb-6 text-base text-ink">{t("body")}</p>
      <Link href="/" className={standaloneLinkClass}>
        {t("home")}
      </Link>
    </main>
  );
}
