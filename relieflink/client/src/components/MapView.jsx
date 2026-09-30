import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function InvalidateMapSize() {
  const map = useMap();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    return () => window.cancelAnimationFrame(frame);
  }, [map]);

  return null;
}

export default function MapView({ center = [20.5937, 78.9629], zoom = 5, markers = [], onMarkerSelect, invalidateOnMount = false, zoomAnimation = true, className = '' }) {
  return (
    <div className={`map-container ${className}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom zoomAnimation={zoomAnimation} className="h-full w-full">
        {invalidateOnMount && <InvalidateMapSize />}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {markers.map((marker) => (
          <Marker key={marker.id} position={marker.position} icon={icon}>
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{marker.type || marker.label || 'Emergency'}</p>
                {marker.details ? <p>{marker.details}</p> : (
                  <>
                    <p>Priority: {marker.priority || 'Unavailable'}</p>
                    <p>Confidence: {typeof marker.confidence === 'number' ? `${Math.round(marker.confidence * 100)}%` : 'Unavailable'}</p>
                    <p>Status: {marker.status || 'Unavailable'}</p>
                    <p>Volunteer: {marker.assignedVolunteer?.user?.name || marker.assignedVolunteer?.name || 'Unassigned'}</p>
                  </>
                )}
                {onMarkerSelect && <button type="button" className="font-medium text-cyan-700" onClick={() => onMarkerSelect(marker.emergency)}>View details</button>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
