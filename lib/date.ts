export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  };
  
  // Use undefined for locale to automatically use the visitor's browser locale
  // This will format dates according to their regional preferences
  return date.toLocaleString(undefined, options);
}