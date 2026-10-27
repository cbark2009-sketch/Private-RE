"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, LayersControl, ZoomControl, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { DOT_COLORS, type PlacedPoint } from "@/lib/mapDots";
import { propertyHref } from "@/lib/links";
import { formatMoney } from "@/lib/format";
import { formatShortDate } from "@/lib/dates";

// Leaflet reads `window` the moment it's imported, so this file is only ever
// loaded in the browser - via next/dynamic with ssr: false in AuctionMap.tsx.

const FLORIDA_BOUNDS: LatLngBoundsExpression = [
  [24.4, -87.7],
  [31.1, -79.9],
];

/**
 * Zooms to fit the dots as soon as there are any, then once more after the
 * last geocoding batch lands so late arrivals are in view too - but never
 * after the user has panned or zoomed themselves, so the map doesn't yank
 * away from wherever they were looking.
 */
function FitToPoints({ points, settled }: { points: PlacedPoint[]; settled: boolean }) {
  const map = useMap();
  const userMoved = useRef(false);
  const programmatic = useRef(false);
  const fittedOnce = useRef(false);

  useEffect(() => {
    const onMoveStart = () => {
      if (!programmatic.current) userMoved.current = true;
    };
    const onMoveEnd = () => {
      programmatic.current = false;
    };
    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  useEffect(() => {
    if (points.length === 0 || userMoved.current) return;
    if (fittedOnce.current && !settled) return;
    programmatic.current = true;
    map.fitBounds(
      points.map((p) => [p.coords.lat, p.coords.lng]),
      { padding: [30, 30], maxZoom: 12 }
    );
    fittedOnce.current = true;
  }, [map, points, settled]);

  return null;
}

export function AuctionMapCanvas({ points, settled }: { points: PlacedPoint[]; settled: boolean }) {
  const router = useRouter();

  return (
    <MapContainer bounds={FLORIDA_BOUNDS} preferCanvas zoomControl={false} className="h-full w-full">
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution="Imagery &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      <ZoomControl position="bottomright" />
      <FitToPoints points={points} settled={settled} />

      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.coords.lat, p.coords.lng]}
          radius={7}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: p.likelyHoa ? DOT_COLORS.hoa : DOT_COLORS.foreclosure,
            fillOpacity: 0.95,
          }}
          // Clicking a dot goes straight to that house's own page; hovering
          // shows a quick preview first so you can tell dots apart.
          eventHandlers={{ click: () => router.push(propertyHref(p.countySlug, p.caseNumber)) }}
        >
          {/* Leaflet tooltips are always white, so colors are fixed here rather than following the site's dark mode. */}
          <Tooltip direction="top" offset={[0, -6]}>
            <div className="flex flex-col gap-0.5 text-xs" style={{ color: "#14152b" }}>
              <strong className="text-sm">{p.address}</strong>
              <span style={{ color: "#63677e" }}>
                {p.countyName} County · {formatShortDate(p.auctionDate)}
              </span>
              {p.likelyHoa ? (
                <span className="font-semibold uppercase tracking-wide" style={{ color: DOT_COLORS.hoa }}>
                  Likely HOA/Lien case
                </span>
              ) : null}
              <span>Final judgment: {formatMoney(p.judgment)}</span>
              {p.valueEstimate != null ? <span>Value estimate: {formatMoney(p.valueEstimate)}</span> : null}
              <span className="mt-0.5 font-semibold" style={{ color: DOT_COLORS.foreclosure }}>
                Click for full details
              </span>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
