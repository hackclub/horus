import { Suspense } from "react";
import { getSettingsData } from "@/app/actions/settings";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

export async function SettingsContent() {
  const data = await getSettingsData();
  return <SettingsClient data={data} />;
}
