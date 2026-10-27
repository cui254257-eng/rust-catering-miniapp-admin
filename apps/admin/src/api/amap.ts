import { load as loadAmapApi } from '@amap/amap-jsapi-loader'
import { API_BASE_URL } from './client'

export type AmapCoordinate = [number, number]
export type AmapRequestStatus = 'complete' | 'no_data' | 'error'

export interface AmapMap {
  setCenter(center: AmapCoordinate): void
  setZoom(zoom: number): void
  setZoomAndCenter(zoom: number, center: AmapCoordinate): void
  resize(): void
  add(overlay: AmapMarker): void
  on(eventName: string, handler: (event: AmapMapEvent) => void): void
  off(eventName: string, handler: (event: AmapMapEvent) => void): void
  destroy(): void
}

export interface AmapMarker {
  setPosition(position: AmapCoordinate): void
  setMap(map: AmapMap | null): void
  on(eventName: string, handler: () => void): void
  off(eventName: string, handler: () => void): void
  getPosition(): unknown
}

export interface AmapMapEvent {
  lnglat: unknown
}

export interface AmapGeocodeResult {
  regeocode?: {
    formattedAddress?: string
  }
  info?: string
}

export interface AmapGeocoder {
  getAddress(
    location: AmapCoordinate,
    callback: (status: string, result: AmapGeocodeResult) => void,
  ): void
}

export interface AmapSuggestion {
  id?: string
  name?: string
  district?: string
  address?: string
  adcode?: string
  location?: unknown
}

export interface AmapAutoComplete {
  on(eventName: 'select' | 'complete' | 'error', handler: (event: unknown) => void): void
  off(eventName: 'select' | 'complete' | 'error', handler: (event: unknown) => void): void
}

export interface AmapPlaceSearch {
  setCity(city: string): void
  search(
    keyword: string,
    callback: (status: AmapRequestStatus, result: { poiList?: { pois?: Array<{ name?: string; address?: string; location?: unknown }> }; info?: string }) => void,
  ): void
}

export interface AmapApi {
  Map: new (container: HTMLElement, options?: { zoom?: number; center?: AmapCoordinate }) => AmapMap
  Marker: new (options: { position: AmapCoordinate; draggable?: boolean }) => AmapMarker
  Geocoder: new (options?: Record<string, unknown>) => AmapGeocoder
  AutoComplete: new (options?: { city?: string; input?: string | HTMLElement }) => AmapAutoComplete
  PlaceSearch: new (options?: { city?: string }) => AmapPlaceSearch
  convertFrom(
    location: AmapCoordinate,
    type: 'gps',
    callback: (status: string, result: { info?: string; locations?: unknown[] }) => void,
  ): void
}

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      serviceHost?: string
      securityJsCode?: string
    }
  }
}

let amapLoader: Promise<AmapApi> | null = null

export function loadAmap(): Promise<AmapApi> {
  if (amapLoader) return amapLoader

  const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin
  // Keep the security code on the API server. JSAPI service plugins (including
  // AutoComplete and Geocoder) use this root-level proxy, which injects jscode.
  window._AMapSecurityConfig = {
    serviceHost: `${apiOrigin}/_AMapService`,
  }

  const key = String(import.meta.env.VITE_AMAP_JS_API_KEY ?? '').trim()
  if (!key) {
    return Promise.reject(new Error('未配置高德地图 JS API Key，请设置 VITE_AMAP_JS_API_KEY'))
  }

  amapLoader = loadAmapApi({
    key,
    version: '2.0',
    plugins: ['AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geocoder'],
  }).then((amap) => amap as AmapApi).catch((error: unknown) => {
    amapLoader = null
    throw error
  })

  return amapLoader
}

export function toCoordinate(location: unknown): AmapCoordinate | null {
  if (Array.isArray(location) && location.length >= 2) {
    const lng = Number(location[0])
    const lat = Number(location[1])
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  if (typeof location === 'string') {
    const [lng, lat] = location.split(',').map(Number)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  if (location && typeof location === 'object') {
    const value = location as { getLng?: () => number; getLat?: () => number; lng?: number; lat?: number }
    const lng = typeof value.getLng === 'function' ? value.getLng() : Number(value.lng)
    const lat = typeof value.getLat === 'function' ? value.getLat() : Number(value.lat)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  return null
}
