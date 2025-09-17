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

export function formatDate(dateInput: string | number | Date): string {
  let date: Date;
  
  if (typeof dateInput === 'number') {
    // Assume timestamp in seconds if number
    date = new Date(dateInput * 1000);
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else {
    date = dateInput;
  }
  
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  };
  
  // Use undefined for locale to automatically use the visitor's browser locale
  return date.toLocaleDateString(undefined, options);
}

export function formatDuration(startDate: string | number | Date, endDate: string | number | Date): string {
  let startDateObj: Date;
  let endDateObj: Date;

  // Convert to Date objects
  if (typeof startDate === 'number') {
    startDateObj = new Date(startDate * 1000);
  } else if (typeof startDate === 'string') {
    startDateObj = new Date(startDate);
  } else {
    startDateObj = startDate;
  }

  if (typeof endDate === 'number') {
    endDateObj = new Date(endDate * 1000);
  } else if (typeof endDate === 'string') {
    endDateObj = new Date(endDate);
  } else {
    endDateObj = endDate;
  }

  const durationMs = endDateObj.getTime() - startDateObj.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 24) {
    if (hours === 0) {
      const minutes = Math.floor(durationMs / (1000 * 60));
      if (minutes === 0) {
        return 'less than a minute';
      }
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatDateRange(startDate: string | number | Date, endDate: string | number | Date): string {
  let startDateObj: Date;
  let endDateObj: Date;
  
  // Convert to Date objects
  if (typeof startDate === 'number') {
    startDateObj = new Date(startDate * 1000);
  } else if (typeof startDate === 'string') {
    startDateObj = new Date(startDate);
  } else {
    startDateObj = startDate;
  }
  
  if (typeof endDate === 'number') {
    endDateObj = new Date(endDate * 1000);
  } else if (typeof endDate === 'string') {
    endDateObj = new Date(endDate);
  } else {
    endDateObj = endDate;
  }
  
  const startYear = startDateObj.getFullYear();
  const endYear = endDateObj.getFullYear();
  
  // For consistency, use a simple format that works well internationally
  // This will produce: "30 Jul 2025 - 20 Aug 2025" or "30 Jul - 20 Aug 2025"
  
  if (startYear === endYear) {
    // Same year: show abbreviated format
    const startFormatted = startDateObj.toLocaleDateString(undefined, { 
      day: 'numeric', 
      month: 'short' 
    });
    const endFormatted = endDateObj.toLocaleDateString(undefined, { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
    return `${startFormatted} - ${endFormatted}`;
  }
  
  // Different years: show full dates
  const startFormatted = formatDate(startDateObj);
  const endFormatted = formatDate(endDateObj);
  return `${startFormatted} - ${endFormatted}`;
}