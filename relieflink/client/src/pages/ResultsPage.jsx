const metrics = [
  { label: 'Accuracy', value: 86.67 },
  { label: 'Macro precision', value: 87.78 },
  { label: 'Macro recall', value: 86.67 },
  { label: 'Macro F1-score', value: 86.60 },
];

const classes = [
  { label: 'Fire', records: 24 },
  { label: 'Flood', records: 24 },
  { label: 'Accident', records: 24 },
];

export default function ResultsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">Model evaluation</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Results</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Preliminary held-out results for the ReliefLink text classifier across Fire, Flood, and Accident reports.
        </p>
      </header>

      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950" role="note">
        <h2 className="font-semibold">Preliminary evaluation — small test set</h2>
        <p className="mt-1 text-sm">
          These results apply only to the TF-IDF + Logistic Regression text classifier. The 15-record held-out set
          limits confidence in generalization; these scores are not measurements of the image model, multimodal
          fusion, or the complete ReliefLink platform.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="text-metrics-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="text-metrics-heading" className="text-xl font-semibold text-slate-900">Text-classifier metrics</h2>
            <p className="mt-1 text-sm text-slate-600">Stratified train/test split · random state 42 · held-out test: 15 records</p>
          </div>
          <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-900">
            TF-IDF + Logistic Regression
          </span>
        </div>

        <div className="mt-6 space-y-4">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <div className="mb-1 flex justify-between gap-4 text-sm">
                <span className="font-medium text-slate-700">{metric.label}</span>
                <span className="font-semibold tabular-nums text-slate-900">{metric.value.toFixed(2)}%</span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label={metric.label}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={metric.value}
              >
                <div className="h-full rounded-full bg-cyan-600" style={{ width: `${metric.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dataset composition</h2>
          <p className="mt-1 text-sm text-slate-600">72 labeled text records; equal class counts.</p>
          <ul className="mt-4 space-y-3">
            {classes.map((item) => (
              <li key={item.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="tabular-nums text-slate-900">{item.records} records</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            This is the dataset composition, not the distribution of real-world emergencies.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Evaluation details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Training subset</dt><dd className="font-medium text-slate-900">57 records</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Held-out test subset</dt><dd className="font-medium text-slate-900">15 records</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Test records per class</dt><dd className="font-medium text-slate-900">5</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-600">Evaluation method</dt><dd className="font-medium text-slate-900">Stratified split</dd></div>
          </dl>
        </div>
      </section>

      <p className="text-sm text-slate-600">
        Image classification, multimodal fusion, and end-to-end accuracy have not yet been evaluated on a comparable
        independent test set. See the project README for the full results discussion and methodology.
      </p>
    </div>
  );
}
