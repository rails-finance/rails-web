type FormatOptions = {
  style?: "decimal" | "currency" | "percent";
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  prefix?: string;
  suffix?: string;
};

export const toLocaleStringHelper = (value: number, options: FormatOptions = {}): string => {
  const {
    style = "decimal",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
    prefix = "",
    suffix = "",
  } = options;

  const formatOptions: Intl.NumberFormatOptions = {
    style,
    minimumFractionDigits,
    maximumFractionDigits,
  };

  if (style === "currency" && currency) {
    formatOptions.currency = currency;
  }

  const formatted = value.toLocaleString("en-US", formatOptions);
  return `${prefix}${formatted}${suffix}`;
};

// Common formatting functions using the helper
export const formatCurrency = (value: number, currency: string): string => {
  return toLocaleStringHelper(value, { suffix: ` ${currency}` });
};

export const formatPrice = (value: number): string => {
  return toLocaleStringHelper(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatUsdValue = (value: number): string => {
  return toLocaleStringHelper(value, {
    prefix: "$",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatNumber = (value: number): string => {
  return toLocaleStringHelper(value);
};

export const formatApproximate = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return formatPrice(value);
};
