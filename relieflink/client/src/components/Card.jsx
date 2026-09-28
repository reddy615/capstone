export default function Card({ title, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h3 className="mb-4 text-lg font-semibold text-slate-800">{title}</h3>}
      {children}
    </div>
  );
}
