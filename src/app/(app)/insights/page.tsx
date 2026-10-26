import { PageHeading } from "@/components/ui";
import { InsightsView } from "@/components/insights-view";

export default function InsightsPage() {
  return (
    <div className="space-y-4">
      <PageHeading title="Insights" description="What the audience is discussing, which questions repeat, how chat is reacting, and optional responses to consider." />
      <InsightsView />
    </div>
  );
}
