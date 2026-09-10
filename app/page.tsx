import { PhoneCall, Building2, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white">
        <PhoneCall className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        MOTECHWA &amp; Sayyidina Omar Institute
      </h1>
      <p className="mt-2 text-sm text-slate-500">Shared line voice assistant — service status</p>

      <section className="mt-10 w-full rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-slate-600">
            This service answers a single shared phone line for two organisations —
            MOTECHWA (technology consulting and fractional CTO services) and the
            Sayyidina Omar Institute (character-formation and mentorship). It has no
            public browser interface: calls are handled entirely by an AI voice
            assistant, which asks which organisation you mean and logs enquiries by
            email to the right inbox.
          </p>
        </div>
        <div className="mt-5 flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-slate-600">
            This page exists only to host the assistant&apos;s enquiry webhook
            (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/api/enquiry</code>).
            There is nothing else to see here.
          </p>
        </div>
      </section>

      <footer className="mt-10 text-xs text-slate-400">
        <p>Calls are handled by an automated assistant and may be recorded for quality purposes.</p>
      </footer>
    </main>
  );
}
