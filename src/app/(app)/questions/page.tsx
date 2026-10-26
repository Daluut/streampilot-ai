import { PageHeading } from "@/components/ui";
import { QuestionQueue } from "@/components/question-queue";

export default function QuestionsPage() {
  return (
    <div className="space-y-4">
      <PageHeading title="Question queue" description="Recurring viewer questions, grouped by similar wording. Mark them handled as you answer them." />
      <QuestionQueue />
    </div>
  );
}
