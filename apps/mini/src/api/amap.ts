import { withCustomerSession } from './auth'
import { request } from './request'

export interface RidingDistance {
  distance_meters: number
  duration_seconds: number
  destination_latitude: number
  destination_longitude: number
}

export interface ReverseGeocodeResult {
  province: string
  city: string
  district: string
  formatted_address: string
}

export function reverseGeocode(longitude: number, latitude: number) {
  return withCustomerSession(() => request<ReverseGeocodeResult>('/maps/reverse-geocode', 'POST', {
    longitude,
    latitude,
  }))
}

export function getRidingDistance(destinationAddress: string) {
  return withCustomerSession(() => request<RidingDistance>('/maps/riding-distance', 'POST', {
    destination_address: destinationAddress,
  }))
}
