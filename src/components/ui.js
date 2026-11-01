export const primaryButton =
  "rounded-full bg-primary px-4 py-3 text-sm font-semibold text-on-primary transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-subtle";

export const secondaryButton =
  "rounded-full border border-line-strong px-4 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

export const smallButton =
  "rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

export const card = "rounded-3xl border border-line bg-surface p-6 shadow-sm";

export const inputClass =
  "rounded-lg border border-line bg-sunken px-2 py-2 text-sm outline-none focus:border-accent";

export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted";

export const chip = (active) =>
  `rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? "bg-primary text-on-primary"
      : "bg-surface-2 text-fg-soft hover:bg-surface-3"
  }`;

export const iconButton =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong text-fg transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
