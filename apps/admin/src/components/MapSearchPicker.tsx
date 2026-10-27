import { useEffect, useId, useRef, useState } from 'react'
import { Alert, App as AntdApp, Button, Input, Modal, Space, Spin, Typography } from 'antd'
import {
  loadAmap,
  toCoordinate,
  type AmapAutoComplete,
  type AmapApi,
  type AmapCoordinate,
  type AmapGeocoder,
  type AmapMap,
  type AmapMapEvent,
  type AmapMarker,
  type AmapPlaceSearch,
  type AmapSuggestion,
} from '@/api/amap'

export interface MapSearchPickerResult {
  addressName: string
  longitude: number
  latitude: number
  location: string
}

interface MapSearchPickerProps {
  open: boolean
  initialAddress?: string
  initialCoordinate?: AmapCoordinate
  onCancel: () => void
  onConfirm: (result: MapSearchPickerResult) => void
}

const DEFAULT_CENTER: AmapCoordinate = [116.397428, 39.90923]

function isValidCoordinate(value?: AmapCoordinate): value is AmapCoordinate {
  return Boolean(value
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180 && value[0] <= 180
    && value[1] >= -85 && value[1] <= 85)
}

// 打开地图选点时尽量使用浏览器定位；不可用时由地图初始化回退到北京。
function getBrowserCoordinate(amap: AmapApi): Promise<AmapCoordinate | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined)

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(undefined), 8000)
    const finish = (coordinate?: AmapCoordinate) => {
      window.clearTimeout(timeoutId)
      resolve(coordinate)
    }

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const gpsCoordinate: AmapCoordinate = [coords.longitude, coords.latitude]
          if (!isValidCoordinate(gpsCoordinate)) {
            finish()
            return
          }

          // Browser GPS uses WGS-84; convert it to the GCJ-02 coordinates used by AMap.
          try {
            amap.convertFrom(gpsCoordinate, 'gps', (status, result) => {
              const coordinate = status === 'complete' && result.info?.toLowerCase() === 'ok'
                ? toCoordinate(result.locations?.[0])
                : null
              finish(coordinate && isValidCoordinate(coordinate) ? coordinate : undefined)
            })
          } catch {
            finish()
          }
        },
        () => finish(),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
      )
    } catch {
      finish()
    }
  })
}

export default function MapSearchPicker({
  open,
  initialAddress = '',
  initialCoordinate,
  onCancel,
  onConfirm,
}: MapSearchPickerProps) {
  const { message } = AntdApp.useApp()
  const inputId = `amap-search-${useId().replaceAll(':', '')}`
  const [mapLoading, setMapLoading] = useState(true)
  const [mapVisible, setMapVisible] = useState(false)
  const [mapBusy, setMapBusy] = useState(false)
  const [mapError, setMapError] = useState<string>()
  const [searchHint, setSearchHint] = useState('输入地点名称并从提示中选择')
  const [searchText, setSearchText] = useState('')
  const [addressName, setAddressName] = useState('')
  const [selectedCoordinate, setSelectedCoordinate] = useState<AmapCoordinate>()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AmapMap | null>(null)
  const markerRef = useRef<AmapMarker | null>(null)
  const geocoderRef = useRef<AmapGeocoder | null>(null)
  const autoCompleteRef = useRef<AmapAutoComplete | null>(null)
  const disposeAutoCompleteRef = useRef<() => void>(() => {})
  const placeSearchRef = useRef<AmapPlaceSearch | null>(null)
  const reverseGeocodeRequestRef = useRef(0)
  const selectionRequestRef = useRef(0)

  useEffect(() => {
    if (open) return
    reverseGeocodeRequestRef.current += 1
    selectionRequestRef.current += 1
    setMapBusy(false)
  }, [open])

  useEffect(() => {
    if (!mapVisible) return

    const hasInitialCoordinate = isValidCoordinate(initialCoordinate)
    if (mapRef.current) {
      if (hasInitialCoordinate) {
        markerRef.current?.setPosition(initialCoordinate)
        mapRef.current.setZoomAndCenter(17, initialCoordinate)
      }
      requestAnimationFrame(() => mapRef.current?.resize())
      return
    }

    let active = true

    setMapLoading(true)
    void loadAmap()
      .then(async (amap) => {
        if (!active) return
        const browserCoordinate = hasInitialCoordinate ? undefined : await getBrowserCoordinate(amap)
        const container = mapContainerRef.current
        if (!active || !container) return

        const center = hasInitialCoordinate ? initialCoordinate : browserCoordinate ?? DEFAULT_CENTER
        const map = new amap.Map(container, { zoom: hasInitialCoordinate ? 17 : 15, center })
        const marker = new amap.Marker({ position: center, draggable: true })
        const geocoder = new amap.Geocoder({ city: '全国' })
        const autocomplete = new amap.AutoComplete({ input: inputId, city: '全国' })
        const placeSearch = new amap.PlaceSearch({ city: '全国' })

        map.add(marker)

        const mapClickHandler = (event: AmapMapEvent) => {
          const coordinate = toCoordinate(event.lnglat)
          if (coordinate) selectCoordinate(coordinate, geocoder, map, marker)
        }
        const markerDragHandler = () => {
          const coordinate = toCoordinate(marker.getPosition())
          if (coordinate) selectCoordinate(coordinate, geocoder, map, marker)
        }
        const selectSuggestionHandler = (event: unknown) => {
          const poi = (event as { poi?: AmapSuggestion }).poi
          if (poi) selectSuggestion(poi, map, marker, placeSearch)
        }
        const completeHandler = (event: unknown) => {
          const result = event as {
            tips?: AmapSuggestion[]
            result?: { tips?: AmapSuggestion[] }
            status?: string
          }
          const tips = result?.tips ?? result?.result?.tips
          if (result?.status === 'no_data' || tips?.length === 0) {
            setSearchHint('没有匹配的地点提示，请换个关键词或在地图上点击选点')
          } else {
            setSearchHint('输入地点名称并从提示中选择')
          }
        }
        const errorHandler = () => {
          setSearchHint('地点提示加载失败，请检查 Key、安全配置或网络')
        }

        marker.on('dragend', markerDragHandler)
        map.on('click', mapClickHandler)
        autocomplete.on('select', selectSuggestionHandler)
        autocomplete.on('complete', completeHandler)
        autocomplete.on('error', errorHandler)
        disposeAutoCompleteRef.current = () => {
          autocomplete.off('select', selectSuggestionHandler)
          autocomplete.off('complete', completeHandler)
          autocomplete.off('error', errorHandler)
        }

        mapRef.current = map
        markerRef.current = marker
        geocoderRef.current = geocoder
        autoCompleteRef.current = autocomplete
        placeSearchRef.current = placeSearch

        if (isValidCoordinate(initialCoordinate)) {
          setSelectedCoordinate(initialCoordinate)
          setAddressName(initialAddress)
        } else if (browserCoordinate) {
          setSearchHint('已定位到当前位置')
          selectCoordinate(browserCoordinate, geocoder, map, marker)
        } else {
          setSearchHint('未获取到定位，地图已显示北京')
        }
        requestAnimationFrame(() => {
          if (active && mapRef.current === map) map.resize()
        })
      })
      .catch((error: unknown) => {
        if (active) setMapError(error instanceof Error ? error.message : '高德地图加载失败')
      })
      .finally(() => {
        if (active) setMapLoading(false)
      })

    return () => {
      active = false
    }
    // The modal is force-rendered while hidden, so initialize the map only
    // after it opens, then retain the instance so closing does not cancel tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVisible])

  useEffect(() => () => {
    disposeAutoCompleteRef.current()
    mapRef.current?.destroy()
    mapRef.current = null
    markerRef.current = null
    geocoderRef.current = null
    autoCompleteRef.current = null
    placeSearchRef.current = null
  }, [])

  function selectCoordinate(
    coordinate: AmapCoordinate,
    geocoder = geocoderRef.current,
    map = mapRef.current,
    marker = markerRef.current,
  ) {
    selectionRequestRef.current += 1
    setMapError(undefined)
    setSelectedCoordinate(coordinate)
    setAddressName('正在解析地址…')
    marker?.setPosition(coordinate)
    map?.setZoomAndCenter(17, coordinate)
    if (!geocoder) return

    const requestId = ++reverseGeocodeRequestRef.current
    setMapBusy(true)
    geocoder.getAddress(coordinate, (status, result) => {
      if (requestId !== reverseGeocodeRequestRef.current) return
      if (status === 'complete' && result.info === 'OK') {
        setAddressName(result.regeocode?.formattedAddress ?? '未返回详细地址')
        setMapError(undefined)
      } else {
        setAddressName('')
        setMapError(status === 'no_data'
          ? '该坐标没有可用的详细地址，请在附近重新选点。'
          : '地址解析失败，请检查地图 Key、安全配置或网络。')
      }
      setMapBusy(false)
    })
  }

  function selectSuggestion(
    poi: AmapSuggestion,
    map: AmapMap,
    marker: AmapMarker,
    placeSearch: AmapPlaceSearch,
  ) {
    const requestId = ++selectionRequestRef.current
    reverseGeocodeRequestRef.current += 1
    setMapBusy(false)
    const coordinate = toCoordinate(poi.location)
    if (coordinate) {
      setMapError(undefined)
      setSearchHint('')
      setAddressName(poi.name ?? '')
      setSelectedCoordinate(coordinate)
      marker.setPosition(coordinate)
      map.setZoomAndCenter(17, coordinate)
      return
    }

    // Some administrative-area tips (e.g. a bare city name) have no point.
    // Only then search the selected tip as a fallback; input suggestions still
    // come from AutoComplete.
    const keyword = poi.name?.trim()
    if (!keyword) {
      setSelectedCoordinate(undefined)
      setAddressName('')
      setSearchHint('所选地点没有坐标，请选择更具体的提示项')
      return
    }
    setSelectedCoordinate(undefined)
    setAddressName('')
    if (poi.adcode) placeSearch.setCity(poi.adcode)
    setMapBusy(true)
    placeSearch.search(keyword, (status, result) => {
      if (requestId !== selectionRequestRef.current) return
      setMapBusy(false)
      const firstPoi = status === 'complete' ? result.poiList?.pois?.[0] : undefined
      const fallbackCoordinate = toCoordinate(firstPoi?.location)
      if (!fallbackCoordinate) {
        setSearchHint(status === 'no_data'
          ? '该行政区没有坐标提示，请选具体地点或直接点击地图'
          : '地点定位失败，请重试或直接点击地图')
        return
      }
      setMapError(undefined)
      setSearchHint('')
      setAddressName(firstPoi?.name || poi.name || '')
      setSelectedCoordinate(fallbackCoordinate)
      marker.setPosition(fallbackCoordinate)
      map.setZoomAndCenter(17, fallbackCoordinate)
    })
  }

  function handleConfirm() {
    if (!selectedCoordinate) {
      message.warning('请先从地点提示中选择位置，或直接点击地图')
      return
    }
    const [longitude, latitude] = selectedCoordinate
    onConfirm({
      addressName: addressName || '地图选点',
      longitude,
      latitude,
      location: `${longitude},${latitude}`,
    })
  }

  function handleOpenChange(isOpen: boolean) {
    setMapVisible(isOpen)
    if (!isOpen) return
    const coordinate = isValidCoordinate(initialCoordinate) ? initialCoordinate : undefined
    setMapError(undefined)
    setSearchHint('输入地点名称并从提示中选择')
    setSearchText('')
    reverseGeocodeRequestRef.current += 1
    selectionRequestRef.current += 1
    setMapBusy(false)
    setAddressName(initialAddress)
    setSelectedCoordinate(coordinate)
  }

  return (
    <Modal
      title="选择门店位置"
      open={open}
      forceRender
      width={860}
      onCancel={onCancel}
      afterOpenChange={handleOpenChange}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="confirm" type="primary" disabled={!selectedCoordinate || mapBusy} onClick={handleConfirm}>
          使用此位置
        </Button>,
      ]}
    >
      <Space.Compact block className="amap-picker-search">
        <Input
          id={inputId}
          value={searchText}
          onChange={(event) => {
            selectionRequestRef.current += 1
            setMapBusy(false)
            setSearchText(event.target.value)
            setSearchHint('输入地点名称并从提示中选择')
          }}
          placeholder="搜索地点，如宁波大学、天一广场、宁波"
          autoComplete="off"
        />
      </Space.Compact>
      <Typography.Text type="secondary" className="amap-picker-search-hint">{searchHint}</Typography.Text>
      {mapError ? <Alert type="error" showIcon title={mapError} className="amap-picker-alert" /> : null}
      <div className="amap-picker-map-frame">
        <div ref={mapContainerRef} className="amap-picker-map" />
        {mapLoading ? <div className="amap-picker-loading"><Spin description="正在加载高德地图…" /></div> : null}
      </div>
      <div className="amap-picker-result">
        <Typography.Text type="secondary">地址名称</Typography.Text>
        <Typography.Text>{addressName || '从提示中选择地点，或点击地图选点'}</Typography.Text>
        {selectedCoordinate ? (
          <>
            <Typography.Text type="secondary">经度：{selectedCoordinate[0].toFixed(6)}</Typography.Text>
            <Typography.Text type="secondary">纬度：{selectedCoordinate[1].toFixed(6)}</Typography.Text>
            <Typography.Text type="secondary">
              高德 location：{selectedCoordinate[0]}, {selectedCoordinate[1]}
            </Typography.Text>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
