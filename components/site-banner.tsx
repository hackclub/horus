import { MessageSquareWarningIcon } from "lucide-react";

export function SiteBanner() {
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="items-center justify-center px-4 py-2 flex flex-row gap-2">
        <MessageSquareWarningIcon size={18} />
        <p className="text-center text-sm">
          Is your instance missing? Reach out and have it added!
        </p>
      </div>
    </div>
  );
}
