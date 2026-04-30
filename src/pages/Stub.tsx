import { AppLayout, PageHeader } from "@/components/AppLayout";

export function StubPage({ title, description }: { title: string; description?: string }) {
  return (
    <AppLayout>
      <PageHeader title={title} description={description} />
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        This screen is part of the next iteration.
      </div>
    </AppLayout>
  );
}
