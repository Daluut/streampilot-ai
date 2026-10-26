import { OverviewView } from "@/components/overview-view";
import { PageHeading } from "@/components/ui";

export default function OverviewPage() {
  return (
    <div className="space-y-4">
      <PageHeading title="Overview" description="Connect to a channel or try the demo, then see what the chat is about, which questions repeat, and what to consider next." />
      <OverviewView />
    </div>
  );
}
