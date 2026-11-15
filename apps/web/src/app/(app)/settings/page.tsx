import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";
import { AccountSection } from "./_components/AccountSection";
import { AppearanceSection } from "./_components/AppearanceSection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.tabs");
  return { title: t("settings") };
}

export default function SettingsPage(): ReactElement {
  return (
    <PageContainer width="narrow" className="space-y-6">
      <AppearanceSection />
      <AccountSection />
    </PageContainer>
  );
}
