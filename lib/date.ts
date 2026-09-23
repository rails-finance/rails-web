export function formatDate(dateInput: string | number | Date): string {
  let date: Date;

  if (typeof dateInput === "number") {
    // Assume timestamp in seconds if number
    date = new Date(dateInput * 1000);
  } else if (typeof dateInput === "string") {
    date = new Date(dateInput);
  } else {
    date = dateInput;
  }

  // Both the locale and the zone are pinned, and for the same reason: this page
  // renders on the server, so the markup is written once by the server and once
  // by the browser, and anything the runtime supplies differs between them.
  //
  //   locale — a server that speaks en-GB writes "7 Feb 2026" and a browser set
  //     to en-US writes "Feb 7, 2026". en-GB is the house form: it is what the
  //     other date call sites pin and what the prose around them writes.
  //   zone — with no timeZone the format uses whatever zone the runtime sits
  //     in, so a London server and a Berlin browser disagree about what day
  //     23:40 UTC falls on. These are block timestamps, which are UTC instants,
  //     and two readers of one event must be given one date.
  //
  // Either mismatch is React error #418: it discards the server's markup for
  // that subtree and repaints it.
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDuration(startDate: string | number | Date, endDate: string | number | Date): string {
  let startDateObj: Date;
  let endDateObj: Date;

  // Convert to Date objects
  if (typeof startDate === "number") {
    startDateObj = new Date(startDate * 1000);
  } else if (typeof startDate === "string") {
    startDateObj = new Date(startDate);
  } else {
    startDateObj = startDate;
  }

  if (typeof endDate === "number") {
    endDateObj = new Date(endDate * 1000);
  } else if (typeof endDate === "string") {
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
        return "less than a minute";
      }
      return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    }
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }

  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function formatDateRange(startDate: string | number | Date, endDate: string | number | Date): string {
  let startDateObj: Date;
  let endDateObj: Date;

  // Convert to Date objects
  if (typeof startDate === "number") {
    startDateObj = new Date(startDate * 1000);
  } else if (typeof startDate === "string") {
    startDateObj = new Date(startDate);
  } else {
    startDateObj = startDate;
  }

  if (typeof endDate === "number") {
    endDateObj = new Date(endDate * 1000);
  } else if (typeof endDate === "string") {
    endDateObj = new Date(endDate);
  } else {
    endDateObj = endDate;
  }

  const startYear = startDateObj.getUTCFullYear();
  const endYear = endDateObj.getUTCFullYear();

  // For consistency, use a simple format that works well internationally
  // This will produce: "30 Jul 2025 - 20 Aug 2025" or "30 Jul - 20 Aug 2025"

  if (startYear === endYear) {
    // Same year: show abbreviated format
    const startFormatted = startDateObj.toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    });
    const endFormatted = endDateObj.toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${startFormatted} - ${endFormatted}`;
  }

  // Different years: show full dates
  const startFormatted = formatDate(startDateObj);
  const endFormatted = formatDate(endDateObj);
  return `${startFormatted} - ${endFormatted}`;
}
