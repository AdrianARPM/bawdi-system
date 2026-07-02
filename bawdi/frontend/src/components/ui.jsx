// src/components/ui.jsx
// Shared reusable components

export const STATUS_CONFIG = {
  'Menunggu Verifikasi': { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-400', border: 'border-amber-200' },
  'Terverifikasi':       { bg: 'bg-blue-50',  text: 'text-blue-800',  dot: 'bg-blue-500',  border: 'border-blue-200' },
  'Disetujui':           { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'Ditolak':             { bg: 'bg-red-50',   text: 'text-red-800',   dot: 'bg-red-500',   border: 'border-red-200' },
};

export function Pill({ status }) {
  const cfg = STATUS_CONFIG[status] || { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400', border: 'border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}
// Penanda pengajuan yang sedang/pernah direvisi — supaya beda jelas dari pengajuan baru.
export function RevisiBadge({ count }) {
  if (!count || count < 1) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">
      🔄 Revisi ke-{count}
    </span>
  );
}

export function Card({ children, className = '', padding = true }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${padding ? 'p-4' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, iconBg, iconColor, sub }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={15} className={iconColor} />
        </div>
      </div>
      <p className="text-3xl font-black text-slate-800 leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </Card>
  );
}

export function Avatar({ initials = '?', size = 'md', color = 'amber' }) {
  const sizes = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs', lg: 'w-11 h-11 text-sm' };
  const colors = { amber: 'bg-amber-400', blue: 'bg-blue-500', green: 'bg-emerald-500', violet: 'bg-violet-500', slate: 'bg-slate-400' };
  return (
    <div className={`${sizes[size]} rounded-full ${colors[color] || 'bg-amber-400'} flex items-center justify-center flex-shrink-0 font-bold text-white`}>
      {initials}
    </div>
  );
}

export function Spinner({ size = 20 }) {
  return (
    <div className="flex items-center justify-center p-8">
      <div style={{ width: size, height: size }}
        className="border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function Empty({ icon: Icon, message, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-slate-400">
      <Icon size={40} className="mb-3 text-slate-200" />
      <p className="text-sm font-medium text-slate-500">{message}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function Input({ label, error, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>}
      <input
        className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400
          ${error
            ? 'border-red-300 focus:border-red-500 bg-red-50'
            : 'border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 bg-white'
          } disabled:bg-slate-50 disabled:text-slate-400`}
        {...props}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>}
      <textarea
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none placeholder:text-slate-400"
        {...props}
      />
    </div>
  );
}

export function Button({ children, variant = 'primary', loading, className = '', ...props }) {
  const variants = {
    primary:  'bg-brand-500 hover:bg-brand-600 text-white font-bold',
    secondary:'border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium',
    danger:   'bg-red-500 hover:bg-red-600 text-white font-bold',
    success:  'bg-emerald-500 hover:bg-emerald-600 text-white font-bold',
    info:     'bg-blue-600 hover:bg-blue-700 text-white font-bold',
  };
  return (
    <button
      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}>
      {loading && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

export const fmtCurrency = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const daysSince = (iso) =>
  iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : 0;
