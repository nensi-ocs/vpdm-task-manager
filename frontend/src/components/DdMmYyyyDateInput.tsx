import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { formatIsoDateDdMmYyyy, parseDdMmYyyyToIso } from "../dateFormat";
import "./DdMmYyyyDateInput.css";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  /** Compact toolbar style (task board header). */
  variant?: "toolbar" | "form";
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

export function DdMmYyyyDateInput({
  value,
  onChange,
  variant = "toolbar",
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const nativeRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (focused) return;
    setDraft("");
  }, [value, focused]);

  const displayText = focused ? draft : formatIsoDateDdMmYyyy(value);

  const commitDraft = useCallback(() => {
    const parsed = parseDdMmYyyyToIso(draft);
    if (parsed) onChange(parsed);
  }, [draft, onChange]);

  const openNativePicker = useCallback(() => {
    const el = nativeRef.current;
    if (!el || disabled) return;
    if (typeof el.showPicker === "function") {
      void el.showPicker();
    } else {
      el.focus();
      el.click();
    }
  }, [disabled]);

  const wrapClass =
    variant === "form"
      ? `ddmm-date-input ddmm-date-input--form${className ? ` ${className}` : ""}`
      : `ddmm-date-input${className ? ` ${className}` : ""}`;

  return (
    <div className={wrapClass}>
      <input
        id={fieldId}
        className="ddmm-date-input-field"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        disabled={disabled}
        aria-label={ariaLabel}
        value={displayText}
        onFocus={() => {
          setFocused(true);
          setDraft(formatIsoDateDdMmYyyy(value));
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="ddmm-date-input-cal"
        disabled={disabled}
        onClick={() => openNativePicker()}
        aria-label={ariaLabel ? `${ariaLabel}, calendar` : "Open calendar"}
      >
        <Calendar size={16} aria-hidden="true" />
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="sr-only"
        value={value}
        min="1000-01-01"
        max="9999-12-31"
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onChange(e.target.value);
          setFocused(false);
          setDraft("");
        }}
      />
    </div>
  );
}
