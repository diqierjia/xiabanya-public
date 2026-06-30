export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({
  label,
  hint,
  error,
  disabled = false,
  className = '',
  id,
  ...rest
}: InputProps) {
  const hasError = Boolean(error);
  const inputId = id || (label ? label.replace(/\s+/g, '-').toLowerCase() : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-600">
          {label}
        </label>
      )}
      <input
        id={inputId}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors outline-none ${
          hasError
            ? 'border-red-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
            : 'border-gray-300 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
        } ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''} ${className}`}
        {...rest}
      />
      {hint && !hasError && (
        <p className="text-xs text-gray-400">{hint}</p>
      )}
      {hasError && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
