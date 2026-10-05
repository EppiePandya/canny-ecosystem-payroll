import { Outlet } from "@remix-run/react";

export default function CTCDetectorLayout() {
  return (
    <section className="flex flex-col h-full">
      <div className="px-4 lg:px-10 xl:px-14 2xl:px-40 py-5 border-b">
        <h1 className="text-2xl font-bold tracking-tight">CTC Detector</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time CTC breakdown — configure basic, earnings, percentage
          components, and statutory settings to instantly compute final CTC.
        </p>
      </div>

      <div className="flex-1 overflow-auto max-sm:pb-12">
        <Outlet />
      </div>
    </section>
  );
}
