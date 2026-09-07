import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page";

type PageTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

/**
 * Compatibility shim for the 16 screens that already import `PageTitle`.
 * All layout now comes from `PageHeader`, so headers are identical everywhere.
 */
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: PageTitleProps) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
    />
  );
}

export { PageHeader };
