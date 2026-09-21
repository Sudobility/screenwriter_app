import type { ReactNode } from "react";

export function Modal({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:hidden">
      <div role="dialog" aria-modal="true" aria-label={title} data-testid={testId} className="bg-white rounded shadow-xl w-full max-w-xl max-h-[85vh] overflow-auto p-5">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}
