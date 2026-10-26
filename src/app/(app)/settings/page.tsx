import { PageHeading } from "@/components/ui";
import { SettingsView } from "@/components/settings-view";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeading title="Settings" description="Connection, AI provider status, analysis timing, buffer size, demo mode and data controls." />
      <SettingsView />
    </div>
  );
}
