"use client";

type MonthOption = { value: string; label: string };

export default function MonthFilter({
  value,
  options,
  label,
}: {
  value: string;
  options: MonthOption[];
  label: string;
}) {
  return (
    <label className="month-filter">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const selected = event.target.value;
          const url = new URL(window.location.href);
          if (selected === "all") {
            url.searchParams.delete("month");
          } else {
            url.searchParams.set("month", selected);
          }
          window.location.href = url.toString();
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
