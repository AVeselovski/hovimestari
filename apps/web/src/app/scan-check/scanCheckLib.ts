// Pure helpers for the throwaway camera check page (branch spike/scan-check,
// which never merges). Kept apart from the component so they can be tested.

export interface LogLine {
  id: number;
  at: Date;
  text: string;
}

/** A clock time to the millisecond, such as 09:04:05.067, in the device's time zone. */
export function clockTime(at: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}.${String(at.getMilliseconds()).padStart(3, "0")}`;
}

/** The log as plain text, newest first, as it shows on the page. */
export function logAsText(lines: readonly LogLine[], rateLine: string | null): string {
  const body = lines.map((line) => `${clockTime(line.at)}  ${line.text}`);
  return [...(rateLine ? [`now  ${rateLine}`] : []), ...body].join("\n");
}

export interface Band {
  /** Source rectangle in the video frame. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Size drawn into the canvas, at most `maxWidth` wide. */
  dw: number;
  dh: number;
}

/**
 * The middle band of a frame: its full width and the middle `fraction` of its
 * height, scaled down so it is at most `maxWidth` wide.
 */
export function middleBand(width: number, height: number, maxWidth = 960, fraction = 0.5): Band {
  const sh = Math.max(1, Math.round(height * fraction));
  const sy = Math.round((height - sh) / 2);
  const scale = width > maxWidth ? maxWidth / width : 1;
  return {
    sx: 0,
    sy,
    sw: width,
    sh,
    dw: Math.max(1, Math.round(width * scale)),
    dh: Math.max(1, Math.round(sh * scale)),
  };
}

export interface LastRead {
  text: string;
  at: number;
}

/** A read is logged unless it repeats the previous text within `windowMs`. */
export function isNewRead(last: LastRead | null, text: string, at: number, windowMs = 1500): boolean {
  return last === null || last.text !== text || at - last.at >= windowMs;
}

/** The GS1 check digit for the digits before it (EAN-13 takes 12, EAN-8 takes 7). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}
