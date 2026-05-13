import { LiveLoc } from "./mapTypes";

export function isFresh(updatedAt?: string | null, maxAgeMs = 2 * 60 * 1000) {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxAgeMs;
}

export function formatLastSeen(updatedAt?: string | null) {
  if (!updatedAt) return "unknown";
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diffMs = Date.now() - t;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function formatMeetWhen(startTime?: string | null, endTime?: string | null) {
  if (!startTime) return "Time TBD";

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;

  if (!Number.isFinite(start.getTime())) return "Time TBD";

  const startLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (!end || !Number.isFinite(end.getTime())) return startLabel;

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    const endClock = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${startLabel} - ${endClock}`;
  }

  const endLabel = end.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${startLabel} → ${endLabel}`;
}

export function formatMeetStatus(status?: string | null) {
  if (!status) return "Planned";
  return status.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function distanceInMeters(a: LiveLoc, b: LiveLoc) {
  const avgLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const metersPerDegLat = 111_111;
  const metersPerDegLng = 111_111 * Math.cos(avgLatRad);

  const dLat = (a.lat - b.lat) * metersPerDegLat;
  const dLng = (a.lng - b.lng) * metersPerDegLng;

  return Math.hypot(dLat, dLng);
}

export function distanceBetweenCoordsMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const avgLatRad = (((a.latitude + b.latitude) / 2) * Math.PI) / 180;
  const metersPerDegLat = 111_111;
  const metersPerDegLng = 111_111 * Math.cos(avgLatRad);

  const dLat = (a.latitude - b.latitude) * metersPerDegLat;
  const dLng = (a.longitude - b.longitude) * metersPerDegLng;

  return Math.hypot(dLat, dLng);
}
