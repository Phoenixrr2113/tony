/**
 * Geofence utilities — haversine distance + reminder checking.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { REMINDERS_PATH, LOCATION_PATH } from "./paths.ts";
import { join } from "path";
import { SOUL_CONFIG_DIR } from "./paths.ts";

export interface LocationEntry {
  name: string;
  label: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  notes?: string;
}

export interface Reminder {
  id: string;
  text: string;
  type: "location" | "time";
  location?: string;       // location name from locations.json
  radiusMeters?: number;   // override default radius
  fireAt?: string;         // ISO timestamp for time-based
  fired: boolean;
  created: string;
}

/**
 * Haversine distance between two lat/lon points in meters.
 */
export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Load named locations from config.
 */
export function loadLocations(): LocationEntry[] {
  const path = join(SOUL_CONFIG_DIR, "locations.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data.locations ?? [];
  } catch {
    return [];
  }
}

/**
 * Load all reminders.
 */
export function loadReminders(): Reminder[] {
  if (!existsSync(REMINDERS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(REMINDERS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Save reminders back to disk.
 */
export function saveReminders(reminders: Reminder[]): void {
  writeFileSync(REMINDERS_PATH, JSON.stringify(reminders, null, 2), "utf-8");
}

/**
 * Get current location from logs/location.json.
 */
export function getCurrentLocation(): { lat: number; lng: number } | null {
  if (!existsSync(LOCATION_PATH)) return null;
  try {
    const loc = JSON.parse(readFileSync(LOCATION_PATH, "utf-8"));
    if (typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check all unfired location reminders against current position.
 * Returns reminders that should fire (within radius).
 */
export function checkLocationReminders(): { reminder: Reminder; locationLabel: string }[] {
  const currentLoc = getCurrentLocation();
  if (!currentLoc) return [];

  const locations = loadLocations();
  const reminders = loadReminders();
  const triggered: { reminder: Reminder; locationLabel: string }[] = [];

  for (const reminder of reminders) {
    if (reminder.fired || reminder.type !== "location" || !reminder.location) continue;

    const loc = locations.find(l => l.name === reminder.location);
    if (!loc || (loc.lat === 0 && loc.lon === 0)) continue; // Skip unconfigured

    const radius = reminder.radiusMeters ?? loc.radiusMeters ?? 500;
    const distance = haversineMeters(currentLoc.lat, currentLoc.lng, loc.lat, loc.lon);

    if (distance <= radius) {
      triggered.push({ reminder, locationLabel: loc.label ?? loc.name });
    }
  }

  return triggered;
}

/**
 * Check all unfired time-based reminders.
 * Returns reminders whose fireAt has passed.
 */
export function checkTimeReminders(): Reminder[] {
  const reminders = loadReminders();
  const now = Date.now();
  const triggered: Reminder[] = [];

  for (const reminder of reminders) {
    if (reminder.fired || reminder.type !== "time" || !reminder.fireAt) continue;

    const fireAt = new Date(reminder.fireAt).getTime();
    if (now >= fireAt) {
      triggered.push(reminder);
    }
  }

  return triggered;
}

/**
 * Mark reminders as fired and save.
 */
export function markFired(ids: string[]): void {
  const reminders = loadReminders();
  for (const r of reminders) {
    if (ids.includes(r.id)) {
      r.fired = true;
    }
  }
  saveReminders(reminders);
}

/**
 * Location transition detection.
 * Tracks which named location Randy is currently at (or null if none).
 * Returns arrival/departure events when state changes.
 */
let currentLocationName: string | null = null;
let locationInitialized = false;

export interface LocationTransition {
  type: "arrived" | "departed";
  locationName: string;
  locationLabel: string;
}

export function checkLocationTransitions(): LocationTransition[] {
  const currentLoc = getCurrentLocation();
  if (!currentLoc) return [];

  const locations = loadLocations();
  const transitions: LocationTransition[] = [];

  // Find which named location Randy is at (if any)
  let atLocation: LocationEntry | null = null;
  for (const loc of locations) {
    const distance = haversineMeters(currentLoc.lat, currentLoc.lng, loc.lat, loc.lon);
    const radius = loc.radiusMeters ?? 500;
    if (distance <= radius) {
      atLocation = loc;
      break;
    }
  }

  const newName = atLocation?.name ?? null;

  // First call: just initialize, don't fire transitions
  if (!locationInitialized) {
    currentLocationName = newName;
    locationInitialized = true;
    return [];
  }

  // No change
  if (newName === currentLocationName) return [];

  // Departed a named location
  if (currentLocationName && !newName) {
    const prev = locations.find(l => l.name === currentLocationName);
    transitions.push({
      type: "departed",
      locationName: currentLocationName,
      locationLabel: prev?.label ?? currentLocationName,
    });
  }

  // Arrived at a named location
  if (newName && newName !== currentLocationName) {
    // If switching directly between two named locations, fire departure first
    if (currentLocationName) {
      const prev = locations.find(l => l.name === currentLocationName);
      transitions.push({
        type: "departed",
        locationName: currentLocationName,
        locationLabel: prev?.label ?? currentLocationName,
      });
    }
    transitions.push({
      type: "arrived",
      locationName: newName,
      locationLabel: atLocation?.label ?? newName,
    });
  }

  currentLocationName = newName;
  return transitions;
}
