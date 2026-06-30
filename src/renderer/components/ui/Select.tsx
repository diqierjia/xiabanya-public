export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({
  label,
  hint,
  error,
  options,
  disabled = false,
  className = '',
  id,
  ...rest
}: SelectProps) {
  const hasError = Boolean(error);
  const selectId = id || (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-600">
          {label}
        </label>
      )}
      <select
        id={selectId}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors outline-none appearance-none bg-white ${
          hasError
            ? 'border-red-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
            : 'border-gray-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
        } ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''} ${className}`}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && !hasError && (
        <p className="text-xs text-gray-400">{hint}</p>
      )}
      {hasError && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
