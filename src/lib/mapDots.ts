import type { MapPoint } from "@/lib/getMapPoints";
import type { Coordinates } from "@/lib/geocode";

// Shared by the map (AuctionMapCanvas.tsx) and its legend (AuctionMap.tsx).
// Kept out of AuctionMapCanvas itself because importing anything from that
// file loads Leaflet, which crashes outside the browser.

export type PlacedPoint = MapPoint & { coords: Coordinates };

export const DOT_COLORS = { foreclosure: "#6552f6", hoa: "#d9720a" } as const;
