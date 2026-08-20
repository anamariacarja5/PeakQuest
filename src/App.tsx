import { useEffect, useRef, useState, type ReactNode } from 'react'

import { supabase } from './lib/supabase'

import Auth from './components/Auth'
import ChatBot from './components/ChatBot'
import Statistics from './components/Statistics'

import exifr from 'exifr'

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from 'react-leaflet'

import { divIcon } from 'leaflet'

import 'leaflet/dist/leaflet.css'
import './App.css'


// =====================================================
// SETĂRI
// =====================================================

const PEAK_SEARCH_RADIUS = 1500

/*
  Dacă fotografia este foarte aproape de vârf,
  îl acceptăm automat.
*/
const PEAK_AUTO_ACCEPT_DISTANCE = 350

/*
  Dacă fotografia este între 350 m și 1500 m
  de cel mai apropiat vârf, întrebăm utilizatorul
  dacă vrea să o considere vizită pe acel vârf.
*/
const PEAK_CONFIRM_DISTANCE = 1500

const LOOKUP_TIMEOUT = 8000

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

const PHOTO_BUCKET = 'VISIT-PHOTOS'

const WIKIDATA_API_URL =
  'https://www.wikidata.org/w/api.php'

const ROMANIA_CENTER: [number, number] = [
  45.8,
  24.9
]


// =====================================================
// TIPURI
// =====================================================

type LocationTypeChoice =
  | 'peak'
  | 'place'
  | null


type PeakInfo = {

  name: string

  elevation: number | null

  latitude: number

  longitude: number

  distance: number

  mountainRange: string | null

}


type PeakMetadata = {

  elevation: number | null

  mountainRange: string | null

  latitude: number | null

  longitude: number | null

  name: string | null

}


type ReverseLocation = {

  displayName: string

  name: string | null

  category: string | null

  type: string | null

  latitude: number | null

  longitude: number | null

  elevation: number | null

  mountainRange: string | null

}


// =====================================================
// ICON MUNTE - DIMENSIUNE DINAMICĂ DUPĂ ZOOM
// =====================================================
//
// Când harta este depărtată, emoji-urile devin mai mici,
// ca să nu se suprapună și să poți distinge mai bine
// pozițiile.
//
// Când apropii harta, markerul revine treptat la dimensiunea
// mare, ușor de apăsat pe telefon.
// =====================================================

function getMountainIcon(
  zoom: number
) {

  let fontSize = 38
  let boxSize = 42


  if (
    zoom <= 6
  ) {

    fontSize = 16
    boxSize = 20

  }

  else if (
    zoom <= 7
  ) {

    fontSize = 19
    boxSize = 23

  }

  else if (
    zoom <= 8
  ) {

    fontSize = 22
    boxSize = 26

  }

  else if (
    zoom <= 9
  ) {

    fontSize = 25
    boxSize = 29

  }

  else if (
    zoom <= 10
  ) {

    fontSize = 28
    boxSize = 32

  }

  else if (
    zoom <= 11
  ) {

    fontSize = 31
    boxSize = 35

  }

  else if (
    zoom <= 12
  ) {

    fontSize = 34
    boxSize = 38

  }


  const anchorX =
    Math.round(
      boxSize / 2
    )


  const anchorY =
    Math.round(
      boxSize * 0.9
    )


  return divIcon({

    html: `
      <div
        style="
          font-size: ${fontSize}px;
          line-height: ${boxSize}px;
          width: ${boxSize}px;
          height: ${boxSize}px;
          text-align: center;
          background: transparent;
          border: none;
          transition:
            font-size 0.15s ease,
            width 0.15s ease,
            height 0.15s ease,
            line-height 0.15s ease;
        "
      >
        🏔️
      </div>
    `,

    className:
      'mountain-marker',

    iconSize:
      [
        boxSize,
        boxSize
      ],

    iconAnchor:
      [
        anchorX,
        anchorY
      ],

    popupAnchor:
      [
        0,
        -anchorY
      ]

  })

}


// =====================================================
// CONTROL HARTĂ
// =====================================================

type MapControllerProps = {

  selectedVisit:
    any | null

  resetSignal:
    number

}


function MapController({

  selectedVisit,

  resetSignal

}: MapControllerProps) {

  const map =
    useMap()


  // ===================================================
  // MERGEM LA LOCAȚIA CĂUTATĂ
  // ===================================================

  useEffect(() => {

    if (!selectedVisit) {

      return

    }


    const latitude =
      Number(
        selectedVisit.latitude
      )


    const longitude =
      Number(
        selectedVisit.longitude
      )


    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {

      return

    }


    map.flyTo(

      [
        latitude,
        longitude
      ],

      15,

      {
        duration: 1.5
      }

    )

  }, [
    selectedVisit,
    map
  ])


  // ===================================================
  // RESET HARTĂ
  // ===================================================

  useEffect(() => {

    if (
      resetSignal === 0
    ) {

      return

    }


    map.flyTo(

      ROMANIA_CENTER,

      7,

      {
        duration: 1.2
      }

    )

  }, [
    resetSignal,
    map
  ])


  return null

}



// =====================================================
// ICON LOCAȚIE NORMALĂ - FĂRĂ IMAGINI EXTERNE
// =====================================================
//
// Nu mai folosim marker-icon.png din Leaflet.
// Pinul este desenat direct din HTML/CSS, deci:
// - merge în browser
// - merge în build Vite
// - merge în Capacitor / Android
// - nu mai poate apărea simbolul de "imagine lipsă"
//
// Și acest marker se micșorează când faci zoom out.
// =====================================================

function getPlaceIcon(
  zoom: number
) {

  let size = 30


  if (
    zoom <= 6
  ) {

    size = 14

  }

  else if (
    zoom <= 7
  ) {

    size = 17

  }

  else if (
    zoom <= 8
  ) {

    size = 20

  }

  else if (
    zoom <= 9
  ) {

    size = 23

  }

  else if (
    zoom <= 10
  ) {

    size = 26

  }

  else if (
    zoom <= 11
  ) {

    size = 28

  }


  const pinSize =
    size


  const dotSize =
    Math.max(
      4,
      Math.round(
        size * 0.28
      )
    )


  const anchorX =
    Math.round(
      pinSize / 2
    )


  const anchorY =
    Math.round(
      pinSize * 1.12
    )


  return divIcon({

    className:
      'peakquest-place-marker',

    html: `
      <div
        style="
          position: relative;
          width: ${pinSize}px;
          height: ${pinSize}px;
        "
      >
        <div
          style="
            position: absolute;
            left: 50%;
            top: 45%;
            width: ${pinSize}px;
            height: ${pinSize}px;
            transform:
              translate(-50%, -50%)
              rotate(-45deg);
            border-radius:
              50% 50% 50% 0;
            background:
              #2f86d7;
            border:
              ${Math.max(
                1,
                Math.round(
                  size * 0.07
                )
              )}px solid rgba(255,255,255,0.95);
            box-shadow:
              0 2px 5px rgba(0,0,0,0.38);
            box-sizing:
              border-box;
          "
        >
          <div
            style="
              position: absolute;
              left: 50%;
              top: 50%;
              width: ${dotSize}px;
              height: ${dotSize}px;
              transform:
                translate(-50%, -50%);
              border-radius: 50%;
              background: white;
            "
          ></div>
        </div>
      </div>
    `,

    iconSize:
      [
        pinSize,
        Math.round(
          pinSize * 1.18
        )
      ],

    iconAnchor:
      [
        anchorX,
        anchorY
      ],

    popupAnchor:
      [
        0,
        -anchorY
      ]

  })

}


// =====================================================
// MARKERE CARE REACȚIONEAZĂ LA ZOOM
// =====================================================

type ZoomAwareMarkersProps = {

  visits:
    any[]

  renderPopup:
    (
      visit:
        any
    ) => ReactNode

}


function ZoomAwareMarkers({

  visits,

  renderPopup

}: ZoomAwareMarkersProps) {

  const map =
    useMap()


  const [
    zoom,
    setZoom
  ] =
    useState(
      map.getZoom()
    )


  useEffect(() => {

    const handleZoom =
      () => {

        setZoom(
          map.getZoom()
        )

      }


    map.on(
      'zoomend',
      handleZoom
    )


    return () => {

      map.off(
        'zoomend',
        handleZoom
      )

    }

  }, [
    map
  ])


  const mountainIcon =
    getMountainIcon(
      zoom
    )


  const placeIcon =
    getPlaceIcon(
      zoom
    )


  return (
    <>

      {
        visits.map(

          (
            visit
          ) => {


            if (
              visit.is_peak
            ) {

              return (

                <Marker

                  key={
                    visit.id
                  }

                  position={[
                    Number(
                      visit.latitude
                    ),
                    Number(
                      visit.longitude
                    )
                  ]}

                  icon={
                    mountainIcon
                  }

                >

                  {
                    renderPopup(
                      visit
                    )
                  }

                </Marker>

              )

            }


            return (

              <Marker

                key={
                  visit.id
                }

                position={[
                  Number(
                    visit.latitude
                  ),
                  Number(
                    visit.longitude
                  )
                ]}

                icon={
                  placeIcon
                }

              >

                {
                  renderPopup(
                    visit
                  )
                }

              </Marker>

            )

          }

        )
      }

    </>
  )

}


// =====================================================
// APP
// =====================================================

function App() {


  // ===================================================
  // STATE
  // ===================================================

  const [
    user,
    setUser
  ] =
    useState<any>(
      null
    )


  const [
    visits,
    setVisits
  ] =
    useState<any[]>(
      []
    )


  const [
    processing,
    setProcessing
  ] =
    useState(
      false
    )


  const [
    status,
    setStatus
  ] =
    useState(
      ''
    )


  const [
    profileOpen,
    setProfileOpen
  ] =
    useState(
      false
    )


  const [
    searchTerm,
    setSearchTerm
  ] =
    useState(
      ''
    )


  const [
    selectedVisit,
    setSelectedVisit
  ] =
    useState<any | null>(
      null
    )


  const [
    resetMapSignal,
    setResetMapSignal
  ] =
    useState(
      0
    )


  const [
    addPopupOpen,
    setAddPopupOpen
  ] =
    useState(
      false
    )


  const [
    mobileToolsOpen,
    setMobileToolsOpen
  ] =
    useState(
      false
    )


  const [
    mobileSearchOpen,
    setMobileSearchOpen
  ] =
    useState(
      false
    )


  const [
    selectedImageUrl,
    setSelectedImageUrl
  ] =
    useState<string | null>(
      null
    )


  const [
    showStatistics,
    setShowStatistics
  ] =
    useState(
      false
    )


  const [
    locationTypeModalOpen,
    setLocationTypeModalOpen
  ] =
    useState(
      false
    )


  const locationTypeResolverRef =
    useRef<
      (
        value:
          LocationTypeChoice
      ) => void
    >(
      null
    )


  const [
    visitDateModalOpen,
    setVisitDateModalOpen
  ] =
    useState(
      false
    )


  const [
    visitDateValue,
    setVisitDateValue
  ] =
    useState(
      ''
    )


  const visitDateResolverRef =
    useRef<
      (
        value:
          string | null
      ) => void
    >(
      null
    )


  // ===================================================
  // AUTENTIFICARE
  // ===================================================

  useEffect(() => {

    getCurrentUser()


    const { data } =
      supabase.auth
        .onAuthStateChange(

          (
            _event,
            session
          ) => {

            setUser(
              session?.user ??
              null
            )

          }

        )


    return () => {

      data
        .subscription
        .unsubscribe()

    }

  }, [])


  useEffect(() => {

    if (user) {

      getVisits()

    }

  }, [user])


  // ===================================================
  // STATUSUL FINAL DISPARE AUTOMAT
  // ===================================================
  //
  // Pe Android, alert()/prompt() poate bloca temporar
  // timer-ele din WebView. De aceea pornim timer-ul
  // numai DUPĂ ce procesarea fotografiei s-a terminat.
  //
  // Astfel dispar și mesajele finale care nu conțin ✅.
  // ===================================================

  useEffect(() => {

    if (
      !status
      ||
      processing
    ) {

      return

    }


    const timer =
      window.setTimeout(

        () => {

          setStatus('')

        },

        3500

      )


    return () => {

      window.clearTimeout(
        timer
      )

    }

  }, [
    status,
    processing
  ])


  // ===================================================
  // CURĂȚĂM URL-UL FOTOGRAFIEI
  // ===================================================

  useEffect(() => {

    return () => {

      if (
        selectedImageUrl &&
        selectedImageUrl
          .startsWith(
            'blob:'
          )
      ) {

        URL.revokeObjectURL(
          selectedImageUrl
        )

      }

    }

  }, [selectedImageUrl])


  // ===================================================
  // USER
  // ===================================================

  async function getCurrentUser() {

    const {
      data: {
        user
      }
    } =
      await supabase
        .auth
        .getUser()


    setUser(
      user
    )

  }


  // ===================================================
  // CITIM LOCAȚIILE
  // ===================================================

  async function getVisits() {

    if (!user) {

      return

    }


    const {
      data,
      error
    } =
      await supabase

        .from(
          'visits'
        )

        .select(
          '*'
        )

        .eq(
          'user_id',
          user.id
        )

        .order(

          'visit_date',

          {
            ascending:
              false
          }

        )


    if (error) {

      console.log(

        'Eroare la citirea locațiilor:',

        error

      )


      return

    }


    setVisits(
      data ??
      []
    )

  }


  // ===================================================
  // UPLOAD FOTOGRAFIE
  // ===================================================

  async function uploadVisitPhoto(
    file: File
  ): Promise<string | null> {

    if (!user) {

      return null

    }


    const extension =
      file.name

        .split('.')

        .pop()

        ?.toLowerCase()

        .replace(
          /[^a-z0-9]/g,
          ''
        )

      ||

      'jpg'


    const fileName =
      `${Date.now()}-${crypto.randomUUID()}.${extension}`


    const filePath =
      `${user.id}/${fileName}`


    const {
      error
    } =
      await supabase

        .storage

        .from(
          PHOTO_BUCKET
        )

        .upload(

          filePath,

          file,

          {

            cacheControl:
              '3600',

            upsert:
              false,

            contentType:
              file.type
              ||
              'image/jpeg'

          }

        )


    if (error) {

      console.log(

        'Eroare upload fotografie:',

        error

      )


      alert(
        `Fotografia nu a putut fi încărcată:\n${error.message}`
      )


      return null

    }


    return filePath

  }


  // ===================================================
  // DESCHIDEM FOTOGRAFIA
  // ===================================================

  async function openVisitPhoto(
    visit: any
  ) {

    if (
      !visit.image_path
    ) {

      alert(
        'Această locație nu are o fotografie salvată.'
      )


      return

    }


    const {
      data,
      error
    } =
      await supabase

        .storage

        .from(
          PHOTO_BUCKET
        )

        .download(
          visit.image_path
        )


    if (error) {

      console.log(

        'Eroare descărcare fotografie:',

        error

      )


      alert(
        `Fotografia nu poate fi deschisă:\n${error.message}`
      )


      return

    }


    if (!data) {

      alert(
        'Fotografia nu a fost găsită.'
      )


      return

    }


    const imageUrl =
      URL.createObjectURL(
        data
      )


    setSelectedImageUrl(
      imageUrl
    )

  }


  // ===================================================
  // ÎNCHIDEM FOTOGRAFIA
  // ===================================================

  function closeImagePreview() {

    if (
      selectedImageUrl &&
      selectedImageUrl
        .startsWith(
          'blob:'
        )
    ) {

      URL.revokeObjectURL(
        selectedImageUrl
      )

    }


    setSelectedImageUrl(
      null
    )

  }


  // ===================================================
  // DISTANȚĂ
  // ===================================================

  function calculateDistance(

    lat1: number,

    lon1: number,

    lat2: number,

    lon2: number

  ) {

    const earthRadius =
      6371000


    const lat1Rad =
      lat1 *
      Math.PI /
      180


    const lat2Rad =
      lat2 *
      Math.PI /
      180


    const deltaLat =
      (
        lat2 -
        lat1
      )
      *
      Math.PI /
      180


    const deltaLon =
      (
        lon2 -
        lon1
      )
      *
      Math.PI /
      180


    const a =

      Math.sin(
        deltaLat / 2
      )

      *

      Math.sin(
        deltaLat / 2
      )

      +

      Math.cos(
        lat1Rad
      )

      *

      Math.cos(
        lat2Rad
      )

      *

      Math.sin(
        deltaLon / 2
      )

      *

      Math.sin(
        deltaLon / 2
      )


    const c =

      2

      *

      Math.atan2(

        Math.sqrt(a),

        Math.sqrt(
          1 - a
        )

      )


    return (
      earthRadius *
      c
    )

  }


  // ===================================================
  // ALTITUDINE
  // ===================================================

  function parseElevation(
    value: any
  ): number | null {

    if (
      value === undefined ||
      value === null
    ) {

      return null

    }


    const parsed =
      Number.parseFloat(

        String(
          value
        )

          .replace(
            ',',
            '.'
          )

      )


    if (
      !Number.isFinite(
        parsed
      )
    ) {

      return null

    }


    return Math.round(
      parsed
    )

  }


  // ===================================================
  // FETCH CU TIMEOUT
  // ===================================================

  async function fetchWithTimeout(

    url: string,

    options:
      RequestInit = {},

    timeout =
      LOOKUP_TIMEOUT

  ) {

    const controller =
      new AbortController()


    const timer =
      window.setTimeout(

        () => {

          controller.abort()

        },

        timeout

      )


    try {

      return await fetch(

        url,

        {

          ...options,

          signal:
            controller.signal

        }

      )

    }

    finally {

      window.clearTimeout(
        timer
      )

    }

  }


  // ===================================================
  // IDENTIFICARE LOCAȚIE
  // ===================================================

  async function getReverseLocation(

    latitude: number,

    longitude: number

  ): Promise<ReverseLocation> {

    try {

      const url =

        `https://nominatim.openstreetmap.org/reverse?`

        +

        `lat=${latitude}`

        +

        `&lon=${longitude}`

        +

        `&format=jsonv2`

        +

        `&zoom=18`

        +

        `&addressdetails=1`

        +

        `&extratags=1`

        +

        `&namedetails=1`

        +

        `&accept-language=ro`


      const response =
        await fetchWithTimeout(

          url,

          {},

          LOOKUP_TIMEOUT

        )


      if (
        !response.ok
      ) {

        throw new Error(
          'Nominatim nu a răspuns corect.'
        )

      }


      const data =
        await response.json()


      const detectedLatitude =
        Number.parseFloat(
          data.lat
        )


      const detectedLongitude =
        Number.parseFloat(
          data.lon
        )


      return {

        displayName:
          data.display_name
          ||
          'Loc vizitat',

        name:
          data.name
          ||
          data.namedetails?.name
          ||
          null,

        category:
          data.category
          ||
          null,

        type:
          data.type
          ||
          null,

        latitude:

          Number.isFinite(
            detectedLatitude
          )

            ? detectedLatitude

            : null,

        longitude:

          Number.isFinite(
            detectedLongitude
          )

            ? detectedLongitude

            : null,

        elevation:
          parseElevation(
            data.extratags?.ele
          ),

        mountainRange:

          data.address
            ?.mountain_range

          ||

          data.extratags
            ?.['is_in:mountains']

          ||

          data.extratags
            ?.['is_in:mountain_range']

          ||

          null

      }

    }

    catch (error) {

      console.log(

        'Eroare Nominatim:',

        error

      )


      return {

        displayName:
          'Loc vizitat',

        name:
          null,

        category:
          null,

        type:
          null,

        latitude:
          null,

        longitude:
          null,

        elevation:
          null,

        mountainRange:
          null

      }

    }

  }


  // ===================================================
  // NORMALIZARE NUME PENTRU WIKIDATA
  // ===================================================

  function normalizePeakLookupName(
    value: string
  ) {

    return value

      .toLowerCase()

      .normalize(
        'NFD'
      )

      .replace(
        /[\u0300-\u036f]/g,
        ''
      )

      .replace(
        /^varful\s+/,
        ''
      )

      .replace(
        /^vf\.?\s+/,
        ''
      )

      .replace(
        /[^a-z0-9\s-]/g,
        ' '
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim()

  }


  // ===================================================
  // WIKIDATA SEARCH
  // ===================================================

  async function wikidataSearchIds(
    search: string,
    language:
      'ro' |
      'en'
  ): Promise<string[]> {

    try {

      const params =
        new URLSearchParams({

          action:
            'wbsearchentities',

          search,

          language,

          uselang:
            language,

          type:
            'item',

          limit:
            '10',

          format:
            'json',

          origin:
            '*'

        })


      const response =
        await fetchWithTimeout(

          `${WIKIDATA_API_URL}?${params.toString()}`,

          {},

          LOOKUP_TIMEOUT

        )


      if (
        !response.ok
      ) {

        return []

      }


      const data =
        await response.json()


      if (
        !Array.isArray(
          data.search
        )
      ) {

        return []

      }


      return data.search

        .map(
          (
            item: any
          ) =>
            item.id
        )

        .filter(
          (
            id: unknown
          ): id is string =>
            typeof id ===
            'string'
        )

    }

    catch (
      error
    ) {

      console.log(
        'Eroare căutare Wikidata:',
        error
      )


      return []

    }

  }


  // ===================================================
  // WIKIDATA ENTITIES
  // ===================================================

  async function wikidataGetEntities(
    ids: string[]
  ): Promise<any[]> {

    const uniqueIds =
      Array.from(
        new Set(
          ids
        )
      )
        .filter(Boolean)


    if (
      uniqueIds.length ===
      0
    ) {

      return []

    }


    try {

      const params =
        new URLSearchParams({

          action:
            'wbgetentities',

          ids:
            uniqueIds.join('|'),

          props:
            'labels|aliases|descriptions|claims',

          languages:
            'ro|en',

          languagefallback:
            '1',

          format:
            'json',

          origin:
            '*'

        })


      const response =
        await fetchWithTimeout(

          `${WIKIDATA_API_URL}?${params.toString()}`,

          {},

          LOOKUP_TIMEOUT

        )


      if (
        !response.ok
      ) {

        return []

      }


      const data =
        await response.json()


      if (
        !data.entities
      ) {

        return []

      }


      return uniqueIds

        .map(
          (
            id
          ) =>
            data.entities[id]
        )

        .filter(Boolean)

    }

    catch (
      error
    ) {

      console.log(
        'Eroare citire Wikidata:',
        error
      )


      return []

    }

  }


  // ===================================================
  // WIKIDATA CLAIMS
  // ===================================================

  function getWikidataQuantity(
    entity: any,
    propertyId: string
  ): number | null {

    const claims =
      entity
        ?.claims
        ?.[propertyId]
      ??
      []


    for (
      const claim
      of claims
    ) {

      const amount =
        claim
          ?.mainsnak
          ?.datavalue
          ?.value
          ?.amount


      const elevation =
        parseElevation(
          amount
        )


      if (
        elevation !==
        null
      ) {

        return elevation

      }

    }


    return null

  }


  function getWikidataCoordinates(
    entity: any
  ) {

    const claims =
      entity
        ?.claims
        ?.P625
      ??
      []


    for (
      const claim
      of claims
    ) {

      const value =
        claim
          ?.mainsnak
          ?.datavalue
          ?.value


      const latitude =
        Number(
          value?.latitude
        )


      const longitude =
        Number(
          value?.longitude
        )


      if (
        Number.isFinite(
          latitude
        )
        &&
        Number.isFinite(
          longitude
        )
      ) {

        return {
          latitude,
          longitude
        }

      }

    }


    return {
      latitude:
        null,
      longitude:
        null
    }

  }


  function getWikidataItemIds(
    entity: any,
    propertyId: string
  ): string[] {

    const claims =
      entity
        ?.claims
        ?.[propertyId]
      ??
      []


    return claims

      .map(
        (
          claim: any
        ) =>
          claim
            ?.mainsnak
            ?.datavalue
            ?.value
            ?.id
      )

      .filter(
        (
          id: unknown
        ): id is string =>
          typeof id ===
          'string'
      )

  }


  function getWikidataNames(
    entity: any
  ): string[] {

    const names =
      new Set<string>()


    const roLabel =
      entity
        ?.labels
        ?.ro
        ?.value


    const enLabel =
      entity
        ?.labels
        ?.en
        ?.value


    if (
      roLabel
    ) {

      names.add(
        roLabel
      )

    }


    if (
      enLabel
    ) {

      names.add(
        enLabel
      )

    }


    for (
      const alias
      of entity
        ?.aliases
        ?.ro
      ??
      []
    ) {

      if (
        alias?.value
      ) {

        names.add(
          alias.value
        )

      }

    }


    for (
      const alias
      of entity
        ?.aliases
        ?.en
      ??
      []
    ) {

      if (
        alias?.value
      ) {

        names.add(
          alias.value
        )

      }

    }


    return Array.from(
      names
    )

  }


  function getWikidataLabel(
    entity: any
  ): string | null {

    return (
      entity
        ?.labels
        ?.ro
        ?.value

      ||

      entity
        ?.labels
        ?.en
        ?.value

      ||

      null
    )

  }


  // ===================================================
  // METADATE VÂRF DIN WIKIDATA
  // ===================================================
  //
  // Nu schimbăm deloc:
  // - GPS-ul fotografiei
  // - Nominatim / locația-traseul
  // - markerul
  //
  // Folosim această funcție doar pentru:
  // - altitudine
  // - masiv
  // ===================================================

  async function getPeakMetadataFromWikidata(

    peakName: string,

    peakLatitude:
      number | null = null,

    peakLongitude:
      number | null = null

  ): Promise<PeakMetadata> {

    const cleanName =
      peakName

        .replace(
          /^V[âa]rful\s+/i,
          ''
        )

        .replace(
          /^Vf\.?\s*/i,
          ''
        )

        .trim()


    const words =
      cleanName

        .split(
          /\s+/
        )

        .filter(Boolean)


    /*
      Ultimul cuvânt este un fallback generic util pentru
      nume precum "Vârful Țuțuiatu".
      Nu există nicio excepție hardcodată pentru un vârf.
    */

    const lastWord =
      words.length >
      1

        ? words[
            words.length - 1
          ]

        : cleanName


    const searchQueries =
      Array.from(
        new Set([
          cleanName,
          `Vârful ${cleanName}`,
          lastWord
        ])
      )


    const results =
      await Promise.all(

        searchQueries.flatMap(
          (
            query
          ) => [

            wikidataSearchIds(
              query,
              'ro'
            ),

            wikidataSearchIds(
              query,
              'en'
            )

          ]
        )

      )


    const ids =
      Array.from(
        new Set(
          results.flat()
        )
      )
        .slice(
          0,
          30
        )


    const entities =
      await wikidataGetEntities(
        ids
      )


    if (
      entities.length ===
      0
    ) {

      return {
        elevation:
          null,
        mountainRange:
          null,
        latitude:
          null,
        longitude:
          null,
        name:
          null
      }

    }


    const requestedName =
      normalizePeakLookupName(
        cleanName
      )


    const ranked =
      entities

        .map(
          (
            entity: any,
            index: number
          ) => {

            const names =
              getWikidataNames(
                entity
              )


            let nameScore =
              1000


            for (
              const name
              of names
            ) {

              const normalized =
                normalizePeakLookupName(
                  name
                )


              if (
                normalized ===
                requestedName
              ) {

                nameScore =
                  Math.min(
                    nameScore,
                    0
                  )

              }

              else if (
                normalized.includes(
                  requestedName
                )
                ||
                requestedName.includes(
                  normalized
                )
              ) {

                nameScore =
                  Math.min(
                    nameScore,
                    100
                  )

              }

            }


            const elevation =
              getWikidataQuantity(
                entity,
                'P2044'
              )


            const coordinates =
              getWikidataCoordinates(
                entity
              )


            const description =
              normalizePeakLookupName(

                `${
                  entity
                    ?.descriptions
                    ?.ro
                    ?.value
                  ??
                  ''
                } ${
                  entity
                    ?.descriptions
                    ?.en
                    ?.value
                  ??
                  ''
                }`

              )


            let score =
              nameScore
              +
              index


            if (
              elevation !==
              null
            ) {

              score -=
                250

            }


            if (
              description.includes(
                'mountain'
              )
              ||
              description.includes(
                'peak'
              )
              ||
              description.includes(
                'summit'
              )
              ||
              description.includes(
                'varf'
              )
              ||
              description.includes(
                'munte'
              )
            ) {

              score -=
                200

            }


            if (
              peakLatitude !==
              null
              &&
              peakLongitude !==
              null
              &&
              coordinates.latitude !==
              null
              &&
              coordinates.longitude !==
              null
            ) {

              const distance =
                calculateDistance(

                  peakLatitude,

                  peakLongitude,

                  coordinates.latitude,

                  coordinates.longitude

                )


              /*
                Dacă avem coordonate din fotografie / OSM,
                le folosim pentru dezambiguizare.
              */

              score +=
                Math.min(
                  distance /
                  100,
                  1000
                )

            }

            else if (
              coordinates.latitude ===
              null
              ||
              coordinates.longitude ===
              null
            ) {

              /*
                Pentru pozele fără GPS preferăm entitățile
                care au coordonate geografice.
              */

              score +=
                600

            }


            return {
              entity,
              score,
              elevation
            }

          }
        )

        .sort(
          (
            a,
            b
          ) =>
            a.score -
            b.score
        )


    const best =
      ranked[0]


    if (
      !best
    ) {

      return {
        elevation:
          null,
        mountainRange:
          null,
        latitude:
          null,
        longitude:
          null,
        name:
          null
      }

    }


    let mountainRange:
      string | null =
      null


    const rangeIds =
      getWikidataItemIds(
        best.entity,
        'P4552'
      )


    if (
      rangeIds.length >
      0
    ) {

      const rangeEntities =
        await wikidataGetEntities(
          rangeIds
        )


      mountainRange =
        getWikidataLabel(
          rangeEntities[0]
        )

    }


    const bestCoordinates =
      getWikidataCoordinates(
        best.entity
      )


    return {

      elevation:
        best.elevation,

      mountainRange,

      latitude:
        bestCoordinates.latitude,

      longitude:
        bestCoordinates.longitude,

      name:
        getWikidataLabel(
          best.entity
        )

    }

  }


  // ===================================================
  // CĂUTARE VÂRF DUPĂ NUME - PENTRU POZE FĂRĂ GPS
  // ===================================================
  //
  // Nu schimbă deloc fluxul fotografiilor care AU GPS.
  //
  // Căutăm vârful în România după nume și încercăm să
  // obținem coordonatele sale.
  // ===================================================

  async function searchPeakCandidatesByName(

    peakName: string

  ): Promise<PeakInfo[]> {

    try {

      const cleanName =
        peakName

          .replace(
            /^V[âa]rful\s+/i,
            ''
          )

          .replace(
            /^Vf\.?\s*/i,
            ''
          )

          .trim()


      const queries =
        Array.from(
          new Set([
            `Vârful ${cleanName}`,
            cleanName
          ])
        )


      const allResults:
        any[] =
        []


      for (
        const query
        of queries
      ) {

        const params =
          new URLSearchParams({

            q:
              `${query}, România`,

            format:
              'jsonv2',

            addressdetails:
              '1',

            extratags:
              '1',

            namedetails:
              '1',

            countrycodes:
              'ro',

            limit:
              '20',

            'accept-language':
              'ro'

          })


        const response =
          await fetchWithTimeout(

            `https://nominatim.openstreetmap.org/search?${params.toString()}`,

            {},

            LOOKUP_TIMEOUT

          )


        if (
          !response.ok
        ) {

          continue

        }


        const data =
          await response.json()


        if (
          Array.isArray(
            data
          )
        ) {

          allResults.push(
            ...data
          )

        }

      }


      if (
        allResults.length ===
        0
      ) {

        return []

      }


      const normalizedRequested =
        normalizePeakLookupName(
          cleanName
        )


      const uniqueCandidates =
        new Map<
          string,
          {
            score: number
            peak: PeakInfo
          }
        >()


      for (
        let index = 0;
        index < allResults.length;
        index++
      ) {

        const item =
          allResults[
            index
          ]


        const latitude =
          Number.parseFloat(
            item.lat
          )


        const longitude =
          Number.parseFloat(
            item.lon
          )


        if (
          !Number.isFinite(
            latitude
          )
          ||
          !Number.isFinite(
            longitude
          )
        ) {

          continue

        }


        const detectedName =

          item.name

          ||

          item.namedetails
            ?.name

          ||

          item.display_name
            ?.split(',')[0]

          ||

          cleanName


        const normalizedDetected =
          normalizePeakLookupName(
            detectedName
          )


        const sameName =

          normalizedDetected ===
          normalizedRequested

          ||

          normalizedDetected.includes(
            normalizedRequested
          )

          ||

          normalizedRequested.includes(
            normalizedDetected
          )


        /*
          Pentru că fotografia NU are GPS, nu avem voie să
          alegem automat primul rezultat doar după nume.

          Păstrăm toate rezultatele plauzibile, în special
          obiectele OSM de tip natural=peak.
        */

        const isPeakObject =

          item.type ===
          'peak'

          ||

          (
            (
              item.category ===
              'natural'

              ||

              item.class ===
              'natural'
            )

            &&

            sameName
          )


        if (
          !sameName
          &&
          !isPeakObject
        ) {

          continue

        }


        let score =
          index


        if (
          normalizedDetected ===
          normalizedRequested
        ) {

          score -=
            600

        }

        else if (
          sameName
        ) {

          score -=
            300

        }


        if (
          item.type ===
          'peak'
        ) {

          score -=
            800

        }


        if (
          item.category ===
          'natural'
          ||
          item.class ===
          'natural'
        ) {

          score -=
            200

        }


        const peak:
          PeakInfo = {

          name:
            detectedName,

          elevation:
            parseElevation(
              item.extratags
                ?.ele
            ),

          latitude,

          longitude,

          distance:
            0,

          mountainRange:

            item.extratags
              ?.['is_in:mountains']

            ||

            item.extratags
              ?.['is_in:mountain_range']

            ||

            item.extratags
              ?.mountain_range

            ||

            null

        }


        /*
          Deduplicăm același vârf dacă apare în ambele
          căutări Nominatim.
        */

        const key =
          `${latitude.toFixed(5)}|${longitude.toFixed(5)}`


        const existing =
          uniqueCandidates.get(
            key
          )


        if (
          !existing
          ||
          score <
          existing.score
        ) {

          uniqueCandidates.set(
            key,
            {
              score,
              peak
            }
          )

        }

      }


      return Array.from(
        uniqueCandidates.values()
      )

        .sort(
          (
            a,
            b
          ) =>
            a.score -
            b.score
        )

        .slice(
          0,
          8
        )

        .map(
          (
            item
          ) =>
            item.peak
        )

    }

    catch (
      error
    ) {

      console.log(
        'Eroare căutare vârfuri după nume:',
        error
      )


      return []

    }

  }


  // ===================================================
  // VÂRF MANUAL PENTRU POZĂ FĂRĂ GPS
  // ===================================================

  async function buildManualPeakFromName(

    typedPeakName:
      string

  ): Promise<{
    peak: PeakInfo
    location: ReverseLocation
  } | null> {

    const cleanName =
      typedPeakName
        .trim()


    if (
      !cleanName
    ) {

      return null

    }


    setStatus(
      `🔎 Caut toate vârfurile numite ${cleanName}...`
    )


    /*
      FĂRĂ GPS nu alegem niciodată automat primul rezultat
      doar pentru că are același nume.

      Exemplu generic:
      "Capra" poate exista în mai multe masive.
    */

    const candidates =
      await searchPeakCandidatesByName(
        cleanName
      )


    // =================================================
    // FALLBACK: NU AM GĂSIT CANDIDAȚI OSM
    // =================================================

    if (
      candidates.length ===
      0
    ) {

      const wikidata =
        await getPeakMetadataFromWikidata(

          cleanName,

          null,

          null

        )


      if (
        wikidata.latitude ===
        null
        ||
        wikidata.longitude ===
        null
      ) {

        return null

      }


      const location =
        await getReverseLocation(

          wikidata.latitude,

          wikidata.longitude

        )


      let elevation =
        wikidata.elevation


      if (
        elevation ===
        null
      ) {

        elevation =
          await getTerrainElevation(

            wikidata.latitude,

            wikidata.longitude

          )

      }


      let mountainRange =
        wikidata.mountainRange
        ??
        location.mountainRange
        ??
        null


      if (
        !mountainRange
      ) {

        mountainRange =
          await getNearbyMountainRangeFromWikidata(

            wikidata.latitude,

            wikidata.longitude

          )

      }


      return {

        peak: {

          name:
            wikidata.name
            ??
            cleanName,

          elevation,

          latitude:
            wikidata.latitude,

          longitude:
            wikidata.longitude,

          distance:
            0,

          mountainRange

        },

        location

      }

    }


    // =================================================
    // COMPLETĂM FIECARE CANDIDAT
    // =================================================
    //
    // Pentru fiecare vârf cu același nume aflăm:
    // - altitudinea
    // - masivul
    // - localitatea / zona
    //
    // Abia apoi utilizatorul alege varianta corectă.
    // =================================================

    const enrichedCandidates =
      await Promise.all(

        candidates.map(

          async (
            candidate
          ) => {

            const location =
              await getReverseLocation(

                candidate.latitude,

                candidate.longitude

              )


            const wikidata =
              await getPeakMetadataFromWikidata(

                cleanName,

                candidate.latitude,

                candidate.longitude

              )


            let elevation =

              candidate.elevation

              ??

              wikidata.elevation


            if (
              elevation ===
              null
            ) {

              elevation =
                await getTerrainElevation(

                  candidate.latitude,

                  candidate.longitude

                )

            }


            let mountainRange =

              wikidata.mountainRange

              ??

              candidate.mountainRange

              ??

              location.mountainRange

              ??

              null


            if (
              !mountainRange
            ) {

              mountainRange =
                await getNearbyMountainRangeFromWikidata(

                  candidate.latitude,

                  candidate.longitude

                )

            }


            return {

              peak: {

                ...candidate,

                elevation,

                mountainRange

              },

              location

            }

          }

        )

      )


    /*
      Dacă există un singur rezultat, îl putem folosi direct.
    */

    if (
      enrichedCandidates.length ===
      1
    ) {

      return enrichedCandidates[0]

    }


    // =================================================
    // MAI MULTE VÂRFURI CU ACELAȘI NUME
    // =================================================

    const candidateList =
      enrichedCandidates

        .map(
          (
            candidate,
            index
          ) => {

            const elevationText =

              candidate
                .peak
                .elevation !==
              null

                ? `${candidate.peak.elevation} m`

                : 'altitudine necunoscută'


            const rangeText =

              candidate
                .peak
                .mountainRange

              ||

              'masiv nedetectat'


            /*
              Pentru dezambiguizare afișăm și o parte din
              locația administrativă.
            */

            const locationText =
              candidate
                .location
                .displayName

                .split(',')

                .slice(
                  0,
                  4
                )

                .join(',')

                .trim()


            return (
              `${
                index + 1
              }. ${
                candidate.peak.name
              }\n   ${rangeText} • ${elevationText}\n   ${locationText}`
            )

          }
        )

        .join(
          '\n\n'
        )


    const selected =
      window.prompt(

`🏔️ Am găsit mai multe vârfuri cu numele:

${cleanName}

Alege varianta corectă scriind NUMĂRUL:

${candidateList}

Exemplu:
1`

      )


    if (
      selected ===
      null
    ) {

      return null

    }


    const selectedIndex =
      Number.parseInt(
        selected.trim(),
        10
      )
      -
      1


    if (
      !Number.isInteger(
        selectedIndex
      )
      ||
      selectedIndex <
      0
      ||
      selectedIndex >=
      enrichedCandidates.length
    ) {

      alert(
        'Alegerea nu este validă. Încearcă din nou și scrie numărul variantei corecte.'
      )


      return null

    }


    return enrichedCandidates[
      selectedIndex
    ]

  }


  // ===================================================
  // FALLBACK MASIV DUPĂ COORDONATE
  // ===================================================
  //
  // Unele vârfuri sunt corect identificate în OSM, dar:
  // - nu au tag is_in:mountains / mountain_range
  // - iar itemul Wikidata al vârfului nu are P4552.
  //
  // În acest caz căutăm, DOAR ca fallback, entități
  // geografice apropiate de coordonatele vârfului în
  // Wikidata și preferăm etichete de tip:
  // "Munții ...", "... Mountains", "Masivul ...", "... Massif".
  //
  // Nu există nicio excepție hardcodată pentru Țuțuiatu
  // sau pentru alt vârf.
  // ===================================================

  async function getNearbyMountainRangeFromWikidata(

    latitude: number,

    longitude: number

  ): Promise<string | null> {

    if (
      !Number.isFinite(
        latitude
      )
      ||
      !Number.isFinite(
        longitude
      )
    ) {

      return null

    }


    try {

      const sparql = `
SELECT ?item ?itemLabel ?distance WHERE {

  SERVICE wikibase:around {

    ?item wdt:P625 ?location .

    bd:serviceParam
      wikibase:center
      "Point(${longitude} ${latitude})"^^geo:wktLiteral .

    bd:serviceParam
      wikibase:radius
      "80" .

    bd:serviceParam
      wikibase:distance
      ?distance .

  }

  SERVICE wikibase:label {

    bd:serviceParam
      wikibase:language
      "ro,en" .

    ?item
      rdfs:label
      ?itemLabel .

  }

  FILTER(
    REGEX(
      LCASE(
        STR(
          ?itemLabel
        )
      ),
      "munții|muntii|mountains|mountain range|masiv|massif"
    )
  )

}
ORDER BY ASC(?distance)
LIMIT 25
      `


      const params =
        new URLSearchParams({

          query:
            sparql,

          format:
            'json'

        })


      const response =
        await fetchWithTimeout(

          `https://query.wikidata.org/sparql?${params.toString()}`,

          {

            headers: {

              Accept:
                'application/sparql-results+json'

            }

          },

          12000

        )


      if (
        !response.ok
      ) {

        return null

      }


      const data =
        await response.json()


      const bindings =
        data
          ?.results
          ?.bindings


      if (
        !Array.isArray(
          bindings
        )
        ||
        bindings.length ===
        0
      ) {

        return null

      }


      const candidates =
        bindings

          .map(
            (
              binding:
                any
            ) => {

              const label =
                String(
                  binding
                    ?.itemLabel
                    ?.value
                  ??
                  ''
                )
                  .trim()


              const distance =
                Number(
                  binding
                    ?.distance
                    ?.value
                )


              if (
                !label
              ) {

                return null

              }


              const normalized =
                label

                  .toLowerCase()

                  .normalize(
                    'NFD'
                  )

                  .replace(
                    /[\u0300-\u036f]/g,
                    ''
                  )


              let score =
                Number.isFinite(
                  distance
                )

                  ? distance

                  : 999


              /*
                Preferăm denumiri care arată clar că
                obiectul este un masiv / lanț montan.
              */

              if (
                normalized.includes(
                  'muntii'
                )
                ||
                normalized.includes(
                  'mountains'
                )
              ) {

                score -=
                  30

              }


              if (
                normalized.includes(
                  'masiv'
                )
                ||
                normalized.includes(
                  'massif'
                )
                ||
                normalized.includes(
                  'mountain range'
                )
              ) {

                score -=
                  20

              }


              /*
                Evităm, când există o alternativă mai bună,
                denumiri care sunt explicit parcuri.
              */

              if (
                normalized.includes(
                  'national park'
                )
                ||
                normalized.includes(
                  'parcul national'
                )
              ) {

                score +=
                  25

              }


              return {

                label,

                score

              }

            }
          )

          .filter(
            Boolean
          )

          .sort(
            (
              a:
                any,
              b:
                any
            ) =>
              a.score -
              b.score
          )


      return (
        candidates[0]
          ?.label
        ??
        null
      )

    }

    catch (
      error
    ) {

      console.log(
        'Eroare fallback masiv Wikidata:',
        error
      )


      return null

    }

  }


  // ===================================================
  // FALLBACK ALTITUDINE DIN TEREN
  // ===================================================
  //
  // Dacă OSM și Wikidata nu au altitudinea, folosim
  // coordonatele EXACTE ale vârfului, nu ale fotografiei.
  // ===================================================

  async function getTerrainElevation(

    latitude: number,

    longitude: number

  ): Promise<number | null> {

    try {

      const url =

        `https://api.open-meteo.com/v1/elevation`

        +

        `?latitude=${encodeURIComponent(
          latitude
        )}`

        +

        `&longitude=${encodeURIComponent(
          longitude
        )}`


      const response =
        await fetchWithTimeout(

          url,

          {},

          LOOKUP_TIMEOUT

        )


      if (
        !response.ok
      ) {

        return null

      }


      const data =
        await response.json()


      const value =
        Array.isArray(
          data.elevation
        )

          ? data.elevation[0]

          : null


      return parseElevation(
        value
      )

    }

    catch (
      error
    ) {

      console.log(
        'Eroare altitudine teren:',
        error
      )


      return null

    }

  }


  // ===================================================
  // COMPLETĂM DOAR METADATELE VÂRFULUI
  // ===================================================

  async function enrichPeakMetadata(
    peak: PeakInfo
  ): Promise<PeakInfo> {

    if (
      peak.elevation !==
      null
      &&
      peak.mountainRange
    ) {

      return peak

    }


    const wikidata =
      await getPeakMetadataFromWikidata(

        peak.name,

        peak.latitude,

        peak.longitude

      )


    let elevation =

      peak.elevation
      ??
      wikidata.elevation


    let mountainRange =

      peak.mountainRange
      ??
      wikidata.mountainRange


    /*
      Dacă OSM și relația directă din Wikidata nu spun
      masivul, îl căutăm generic după coordonatele vârfului.
      Celelalte vârfuri care au deja masivul NU sunt afectate.
    */

    if (
      !mountainRange
    ) {

      mountainRange =
        await getNearbyMountainRangeFromWikidata(

          peak.latitude,

          peak.longitude

        )

    }


    if (
      elevation ===
      null
    ) {

      elevation =
        await getTerrainElevation(

          peak.latitude,

          peak.longitude

        )

    }


    return {

      ...peak,

      elevation,

      mountainRange

    }

  }


  // ===================================================
  // CĂUTARE VÂRF
  // ===================================================

  async function getNearbyPeak(

    latitude: number,

    longitude: number

  ): Promise<PeakInfo | null> {

    const query = `

      [out:json][timeout:8];

      node(
        around:${PEAK_SEARCH_RADIUS},
        ${latitude},
        ${longitude}
      )
      ["natural"="peak"];

      out body;

    `


    let lastError:
      unknown =
      null


    for (
      const overpassUrl
      of OVERPASS_URLS
    ) {

      try {

        const response =
          await fetchWithTimeout(

            overpassUrl,

            {

              method:
                'POST',

              headers: {

                'Content-Type':
                  'application/x-www-form-urlencoded'

              },

              body:
                new URLSearchParams({

                  data:
                    query

                })

            },

            LOOKUP_TIMEOUT

          )


        if (
          !response.ok
        ) {

          throw new Error(
            `Overpass HTTP ${response.status}`
          )

        }


        const data =
          await response.json()


        if (
          !data.elements
          ||
          data.elements.length ===
          0
        ) {

          continue

        }


        let nearestPeak:
          PeakInfo | null =
          null


        for (
          const element
          of data.elements
        ) {

          if (
            typeof element.lat !==
            'number'
            ||
            typeof element.lon !==
            'number'
          ) {

            continue

          }


          const distance =
            calculateDistance(

              latitude,

              longitude,

              element.lat,

              element.lon

            )


          const peak:
            PeakInfo = {

            name:

              element.tags
                ?.['name:ro']

              ||

              element.tags
                ?.name

              ||

              'Vârf fără nume',

            elevation:

              parseElevation(
                element.tags?.ele
              ),

            latitude:
              element.lat,

            longitude:
              element.lon,

            distance,

            mountainRange:

              element.tags
                ?.['is_in:mountains']

              ||

              element.tags
                ?.['is_in:mountain_range']

              ||

              element.tags
                ?.mountain_range

              ||

              null

          }


          if (
            !nearestPeak
            ||
            peak.distance <
            nearestPeak.distance
          ) {

            nearestPeak =
              peak

          }

        }


        /*
          Returnăm cel mai apropiat vârf din raza de
          1500 m. Decizia finală dacă fotografia este
          "pe vârf" se face în handlePhoto().
        */

        if (
          nearestPeak
          &&
          nearestPeak.distance <=
          PEAK_CONFIRM_DISTANCE
        ) {

          return nearestPeak

        }

      }

      catch (
        error
      ) {

        lastError =
          error


        console.log(
          `Overpass indisponibil: ${overpassUrl}`,
          error
        )

      }

    }


    if (
      lastError
    ) {

      console.log(
        'Nu am putut interoga niciun server Overpass.',
        lastError
      )

    }


    return null

  }

  // ===================================================
  // NOMINATIM SPUNE CĂ ESTE VÂRF
  // ===================================================

  function peakFromReverseLocation(

    location:
      ReverseLocation,

    photoLatitude:
      number,

    photoLongitude:
      number

  ): PeakInfo | null {

    if (
      location.category !==
      'natural'
      ||
      location.type !==
      'peak'
    ) {

      return null

    }


    const peakLatitude =
      location.latitude
      ??
      photoLatitude


    const peakLongitude =
      location.longitude
      ??
      photoLongitude


    const distance =
      calculateDistance(

        photoLatitude,

        photoLongitude,

        peakLatitude,

        peakLongitude

      )


    if (
      distance >
      PEAK_CONFIRM_DISTANCE
    ) {

      return null

    }


    return {

      name:

        location.name

        ||

        location.displayName
          .split(',')[0]

        ||

        'Vârf montan',

      elevation:
        location.elevation,

      latitude:
        peakLatitude,

      longitude:
        peakLongitude,

      distance:
        distance,

      mountainRange:
        location.mountainRange

    }

  }


  // ===================================================
  // CĂUTARE DESTINAȚIE DUPĂ NUME - POZĂ FĂRĂ GPS
  // ===================================================
  //
  // Dacă fotografia nu are coordonate și utilizatorul
  // alege "Altă destinație", cerem numele locului și
  // căutăm coordonatele lui în Nominatim.
  //
  // Exemplu:
  // Lacul Bâlea
  // Cabana Curmătura
  // Cascada Cailor
  // ===================================================

  async function searchPlaceByName(

    placeName:
      string

  ): Promise<{
    name: string
    displayName: string
    latitude: number
    longitude: number
  } | null> {

    const cleanName =
      placeName
        .trim()


    if (
      !cleanName
    ) {

      return null

    }


    try {

      const params =
        new URLSearchParams({

          q:
            `${cleanName}, România`,

          format:
            'jsonv2',

          addressdetails:
            '1',

          namedetails:
            '1',

          extratags:
            '1',

          countrycodes:
            'ro',

          limit:
            '10',

          'accept-language':
            'ro'

        })


      const response =
        await fetchWithTimeout(

          `https://nominatim.openstreetmap.org/search?${params.toString()}`,

          {},

          LOOKUP_TIMEOUT

        )


      if (
        !response.ok
      ) {

        return null

      }


      const data =
        await response.json()


      if (
        !Array.isArray(
          data
        )
        ||
        data.length ===
        0
      ) {

        return null

      }


      const normalizedRequested =
        normalizeSearchText(
          cleanName
        )


      const ranked =
        data

          .map(
            (
              item:
                any,
              index:
                number
            ) => {

              const latitude =
                Number.parseFloat(
                  item.lat
                )


              const longitude =
                Number.parseFloat(
                  item.lon
                )


              if (
                !Number.isFinite(
                  latitude
                )
                ||
                !Number.isFinite(
                  longitude
                )
              ) {

                return null

              }


              const detectedName =

                item.name

                ||

                item.namedetails
                  ?.name

                ||

                item.display_name
                  ?.split(',')[0]

                ||

                cleanName


              const normalizedDetected =
                normalizeSearchText(
                  detectedName
                )


              let score =
                index


              if (
                normalizedDetected ===
                normalizedRequested
              ) {

                score -=
                  500

              }

              else if (
                normalizedDetected.includes(
                  normalizedRequested
                )
                ||
                normalizedRequested.includes(
                  normalizedDetected
                )
              ) {

                score -=
                  250

              }


              return {

                score,

                result: {

                  name:
                    detectedName,

                  displayName:
                    item.display_name
                    ||
                    detectedName,

                  latitude,

                  longitude

                }

              }

            }
          )

          .filter(
            Boolean
          )

          .sort(
            (
              a:
                any,
              b:
                any
            ) =>
              a.score -
              b.score
          )


      return (
        ranked[0]
          ?.result
        ??
        null
      )

    }

    catch (
      error
    ) {

      console.log(
        'Eroare căutare destinație după nume:',
        error
      )


      return null

    }

  }


  // ===================================================
  // ALEGERE: VÂRF SAU ALTĂ DESTINAȚIE
  // ===================================================
  //
  // Pentru fotografiile CU GPS păstrăm alegerea explicită:
  // 🏔️ Vârf
  // 📍 Altă destinație
  //
  // Astfel o fotografie făcută lângă un vârf nu este
  // clasificată automat ca vârf dacă utilizatorul vrea
  // să salveze doar traseul, lacul, cabana etc.
  // ===================================================

  function askLocationType() {

    return new Promise<
      LocationTypeChoice
    >(
      (
        resolve
      ) => {

        locationTypeResolverRef.current =
          resolve


        setLocationTypeModalOpen(
          true
        )

      }
    )

  }


  function resolveLocationType(
    choice:
      LocationTypeChoice
  ) {

    setLocationTypeModalOpen(
      false
    )


    const resolver =
      locationTypeResolverRef.current


    locationTypeResolverRef.current =
      null


    resolver?.(
      choice
    )

  }


  // ===================================================
  // DATA VIZITEI
  // ===================================================
  //
  // visit_date = data reală a drumeției
  // created_at = data la care fotografia este încărcată
  //
  // Încercăm să citim automat data fotografiei din EXIF.
  // Utilizatorul o poate confirma sau modifica înainte
  // ca fotografia să fie salvată.
  // ===================================================

  function getTodayInputDate() {

    const today =
      new Date()


    const year =
      today.getFullYear()


    const month =
      String(
        today.getMonth() + 1
      ).padStart(
        2,
        '0'
      )


    const day =
      String(
        today.getDate()
      ).padStart(
        2,
        '0'
      )


    return `${year}-${month}-${day}`

  }


  function dateToInputValue(
    date: Date
  ) {

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return null

    }


    const year =
      date.getFullYear()


    const month =
      String(
        date.getMonth() + 1
      ).padStart(
        2,
        '0'
      )


    const day =
      String(
        date.getDate()
      ).padStart(
        2,
        '0'
      )


    return `${year}-${month}-${day}`

  }


  async function getPhotoVisitDate(
    file: File
  ): Promise<string | null> {

    try {

      const metadata =
        await exifr.parse(
          file,
          [
            'DateTimeOriginal',
            'CreateDate',
            'ModifyDate'
          ]
        )


      const rawDate =
        metadata?.DateTimeOriginal
        ??
        metadata?.CreateDate
        ??
        metadata?.ModifyDate
        ??
        null


      if (
        !rawDate
      ) {

        return null

      }


      const date =
        rawDate instanceof Date
          ? rawDate
          : new Date(
              rawDate
            )


      return dateToInputValue(
        date
      )

    }

    catch (
      error
    ) {

      console.log(
        'Nu am putut citi data EXIF:',
        error
      )


      return null

    }

  }


  function askVisitDate(
    defaultValue: string
  ) {

    return new Promise<
      string | null
    >(
      (
        resolve
      ) => {

        visitDateResolverRef.current =
          resolve


        setVisitDateValue(
          defaultValue
        )


        setVisitDateModalOpen(
          true
        )

      }
    )

  }


  function resolveVisitDate(
    value: string | null
  ) {

    if (
      value !== null
      &&
      !value
    ) {

      alert(
        'Alege data vizitei.'
      )


      return

    }


    setVisitDateModalOpen(
      false
    )


    const resolver =
      visitDateResolverRef.current


    visitDateResolverRef.current =
      null


    resolver?.(
      value
    )

  }


  function formatVisitDate(
    value:
      string | null | undefined
  ) {

    if (
      !value
    ) {

      return 'necunoscută'

    }


    const parts =
      value
        .split(
          '-'
        )


    if (
      parts.length !== 3
    ) {

      return value

    }


    return `${parts[2]}.${parts[1]}.${parts[0]}`

  }


  // ===================================================
  // ADĂUGARE FOTOGRAFIE
  // ===================================================

  async function handlePhoto(
    file: File
  ) {

    setProcessing(
      true
    )


    setStatus(
      '📷 Citesc coordonatele GPS...'
    )


    try {

      const [
        gps,
        exifVisitDate
      ] =
        await Promise.all([

          exifr.gps(
            file
          ),

          getPhotoVisitDate(
            file
          )

        ])


      const visitDate =
        await askVisitDate(

          exifVisitDate
          ??
          getTodayInputDate()

        )


      if (
        visitDate ===
        null
      ) {

        setStatus(
          ''
        )


        return

      }


      if (!gps) {

        setStatus(
          '📍 Fotografia nu are GPS — alege tipul locației.'
        )


        /*
          IMPORTANT:
          Folosim EXACT aceeași fereastră ca pentru pozele cu GPS:
          🏔️ Este un vârf
          📍 Altă destinație
        */

        const locationType =
          await askLocationType()


        if (
          locationType ===
          null
        ) {

          setStatus(
            ''
          )


          return

        }


        // =================================================
        // POZĂ FĂRĂ GPS + VÂRF
        // =================================================

        if (
          locationType ===
          'peak'
        ) {

          const typedPeakName =
            window.prompt(

`Fotografia nu are coordonate GPS.

Scrie numele vârfului.

Exemple:
Omu
Negoiu
Țuțuiatu
Vânătarea lui Buteanu`

            )


          if (
            typedPeakName ===
            null
            ||
            !typedPeakName
              .trim()
          ) {

            setStatus(
              ''
            )


            return

          }


          const manualResult =
            await buildManualPeakFromName(

              typedPeakName

            )


          if (
            !manualResult
          ) {

            alert(
              'Nu am putut identifica automat acest vârf. Verifică numele și încearcă din nou.'
            )


            setStatus(
              ''
            )


            return

          }


          const manualPeak =
            manualResult.peak


          const manualLocation =
            manualResult.location


          const manualLocationDetails =
            manualLocation.displayName


          const manualMountainRange =
            manualPeak.mountainRange
            ??
            manualLocation.mountainRange
            ??
            null


          const manualInfo =
`🏔️ VÂRF IDENTIFICAT

${manualPeak.name}

Altitudine:
${
  manualPeak.elevation !== null
    ? `${manualPeak.elevation} m`
    : 'necunoscută'
}

Masiv:
${
  manualMountainRange
  ||
  'nedetectat automat'
}

📍 Locație:
${manualLocationDetails}

Coordonatele markerului:
${manualPeak.latitude.toFixed(6)},
${manualPeak.longitude.toFixed(6)}

Fotografia nu are GPS, deci markerul va fi pus
la coordonatele vârfului identificat.`


          const description =
            window.prompt(

`${manualInfo}

Scrie o descriere pentru această fotografie:`

            )


          if (
            description ===
            null
          ) {

            return

          }


          if (
            !user
          ) {

            return

          }


          setStatus(
            '📷 Salvez fotografia...'
          )


          const imagePath =
            await uploadVisitPhoto(
              file
            )


          if (
            !imagePath
          ) {

            return

          }


          setStatus(
            '💾 Salvez vârful...'
          )


          const {
            error
          } =
            await supabase

              .from(
                'visits'
              )

              .insert({

                user_id:
                  user.id,

                latitude:
                  manualPeak.latitude,

                longitude:
                  manualPeak.longitude,

                place_name:
                  manualPeak.name,

                location_details:
                  manualLocationDetails,

                is_peak:
                  true,

                peak_elevation:
                  manualPeak.elevation,

                mountain_range:
                  manualMountainRange,

                description,

                image_path:
                  imagePath,

                visit_date:
                  visitDate

              })


          if (
            error
          ) {

            console.log(
              'Eroare Supabase:',
              error
            )


            await supabase

              .storage

              .from(
                PHOTO_BUCKET
              )

              .remove([
                imagePath
              ])


            alert(
              'Vârful nu a putut fi salvat.'
            )


            return

          }


          await getVisits()


          setStatus(
            `✅ ${manualPeak.name} a fost adăugat 🏔️`
          )


          alert(
            `Vârful ${manualPeak.name} a fost adăugat! 🏔️`
          )


          return

        }


        // =================================================
        // POZĂ FĂRĂ GPS + ALTĂ DESTINAȚIE
        // =================================================

        const typedPlaceName =
          window.prompt(

`Fotografia nu are coordonate GPS.

Scrie numele destinației.

Exemple:
Lacul Bâlea
Cabana Curmătura
Cascada Cailor`

          )


        if (
          typedPlaceName ===
          null
          ||
          !typedPlaceName
            .trim()
        ) {

          setStatus(
            ''
          )


          return

        }


        setStatus(
          `🔎 Caut ${typedPlaceName.trim()}...`
        )


        const manualPlace =
          await searchPlaceByName(

            typedPlaceName

          )


        if (
          !manualPlace
        ) {

          alert(
            'Nu am putut identifica această destinație. Încearcă să scrii un nume mai exact.'
          )


          setStatus(
            ''
          )


          return

        }


        const confirmedPlace =
          window.confirm(

`📍 Am găsit:

${manualPlace.displayName}

Coordonate:
${manualPlace.latitude.toFixed(6)},
${manualPlace.longitude.toFixed(6)}

Este aceasta destinația corectă?`

          )


        if (
          !confirmedPlace
        ) {

          setStatus(
            ''
          )


          return

        }


        const description =
          window.prompt(

`📍 DESTINAȚIE IDENTIFICATĂ

${manualPlace.displayName}

Fotografia nu are GPS, deci markerul va fi pus
la coordonatele destinației găsite.

Scrie o descriere pentru această fotografie:`

          )


        if (
          description ===
          null
        ) {

          return

        }


        if (
          !user
        ) {

          return

        }


        setStatus(
          '📷 Salvez fotografia...'
        )


        const imagePath =
          await uploadVisitPhoto(
            file
          )


        if (
          !imagePath
        ) {

          return

        }


        setStatus(
          '💾 Salvez destinația...'
        )


        const {
          error
        } =
          await supabase

            .from(
              'visits'
            )

            .insert({

              user_id:
                user.id,

              latitude:
                manualPlace.latitude,

              longitude:
                manualPlace.longitude,

              place_name:
                manualPlace.name,

              location_details:
                manualPlace.displayName,

              is_peak:
                false,

              peak_elevation:
                null,

              mountain_range:
                null,

              description,

              image_path:
                imagePath,

              visit_date:
                  visitDate

            })


        if (
          error
        ) {

          console.log(
            'Eroare Supabase:',
            error
          )


          await supabase

            .storage

            .from(
              PHOTO_BUCKET
            )

            .remove([
              imagePath
            ])


          alert(
            'Destinația nu a putut fi salvată.'
          )


          return

        }


        await getVisits()


        setStatus(
          `✅ ${manualPlace.name} a fost adăugată 📍`
        )


        alert(
          `${manualPlace.name} a fost adăugată pe hartă! 📍`
        )


        return

      }

      const latitude =
        gps.latitude


      const longitude =
        gps.longitude


      setStatus(

        `✅ GPS detectat: `

        +

        `${latitude.toFixed(6)}, `

        +

        `${longitude.toFixed(6)} — `

        +

        `identific locația...`

      )


      const [
        location,
        overpassPeak
      ] =
        await Promise.all([

          getReverseLocation(
            latitude,
            longitude
          ),

          getNearbyPeak(
            latitude,
            longitude
          )

        ])


      const nominatimPeak =
        peakFromReverseLocation(

          location,

          latitude,

          longitude

        )


      // =================================================
      // UTILIZATORUL ALEGE TIPUL LOCAȚIEI
      // =================================================

      const locationType =
        await askLocationType()


      /*
        X = anulăm adăugarea fotografiei.
      */

      if (
        locationType ===
        null
      ) {

        setStatus(
          ''
        )


        return

      }


      let peak:
        PeakInfo | null =
        null


      // =================================================
      // DACĂ A ALES VÂRF
      // =================================================

      if (
        locationType ===
        'peak'
      ) {

        peak =
          nominatimPeak
          ??
          overpassPeak


        /*
          Dacă serviciile automate nu găsesc vârful,
          îi permitem să scrie numele.

          IMPORTANT:
          markerul salvat rămâne la coordonatele GPS
          ale fotografiei. Numele introdus este folosit
          doar pentru identificarea vârfului și metadate.
        */

        if (
          !peak
        ) {

          const typedPeakName =
            window.prompt(

`🏔️ Nu am identificat automat un vârf suficient de aproape.

Scrie numele vârfului pe care l-ai vizitat.

Exemple:
Omu
Negoiu
Țuțuiatu
Vânătarea lui Buteanu`

            )


          if (
            typedPeakName ===
            null
            ||
            !typedPeakName
              .trim()
          ) {

            setStatus(
              ''
            )


            return

          }


          const manualResult =
            await buildManualPeakFromName(

              typedPeakName

            )


          if (
            !manualResult
          ) {

            alert(
              'Nu am putut identifica automat acest vârf. Verifică numele și încearcă din nou.'
            )


            setStatus(
              ''
            )


            return

          }


          peak = {

            ...manualResult.peak,

            distance:
              calculateDistance(

                latitude,

                longitude,

                manualResult
                  .peak
                  .latitude,

                manualResult
                  .peak
                  .longitude

              )

          }

        }


        /*
          Dacă vârful automat găsit este mai departe,
          confirmăm că este chiar cel dorit.
        */

        if (
          peak
          &&
          peak.distance >
          PEAK_AUTO_ACCEPT_DISTANCE
          &&
          peak.distance <=
          PEAK_CONFIRM_DISTANCE
        ) {

          const confirmedPeak =
            window.confirm(

`🏔️ Am găsit:

${peak.name}

Distanță față de fotografia ta:
${Math.round(
  peak.distance
)} m

Este acesta vârful pe care l-ai vizitat?`

            )


          if (
            !confirmedPeak
          ) {

            const typedPeakName =
              window.prompt(

`Scrie numele corect al vârfului.`

              )


            if (
              typedPeakName ===
              null
              ||
              !typedPeakName
                .trim()
            ) {

              setStatus(
                ''
              )


              return

            }


            const manualResult =
              await buildManualPeakFromName(

                typedPeakName

              )


            if (
              !manualResult
            ) {

              alert(
                'Nu am putut identifica automat acest vârf.'
              )


              setStatus(
                ''
              )


              return

            }


            peak = {

              ...manualResult.peak,

              distance:
                calculateDistance(

                  latitude,

                  longitude,

                  manualResult
                    .peak
                    .latitude,

                  manualResult
                    .peak
                    .longitude

                )

            }

          }

        }

      }


      /*
        Dacă locationType === 'place':
        peak rămâne null.

        Astfel se salvează:
        is_peak = false

        și va apărea markerul albastru pentru destinație.
      */


      /*
        Dacă vârful a fost deja identificat corect, completăm
        numai altitudinea și masivul. Locația/traseul rămâne
        exact rezultatul Nominatim existent.
      */

      if (
        peak
      ) {

        setStatus(
          `🔎 Completez datele pentru ${peak.name}...`
        )


        peak =
          await enrichPeakMetadata(
            peak
          )

      }


      const isPeak =
        peak !== null


      const placeName =
        peak
          ? peak.name
          : location.displayName


      const locationDetails =
        location.displayName


      const mountainRange =
        peak?.mountainRange
        ??
        location.mountainRange
        ??
        null


      let detectedInfo =
        ''


      if (peak) {

        detectedInfo =
`🏔️ VÂRF MONTAN DETECTAT

${peak.name}

Altitudine:
${
  peak.elevation !== null
    ? `${peak.elevation} m`
    : 'necunoscută'
}

Masiv:
${
  mountainRange ||
  'nedetectat automat'
}

📍 Locație / traseu:
${locationDetails}

Distanță față de vârf:
${Math.round(
  peak.distance
)} m`

      }

      else {

        detectedInfo =
`📍 LOCAȚIE DETECTATĂ

${locationDetails}`

      }


      setStatus(

        peak

          ? `🏔️ Vârf detectat: ${peak.name}`

          : `📍 ${locationDetails}`

      )


      const description =
        window.prompt(

`${detectedInfo}

Coordonatele exacte ale fotografiei:

Latitudine:
${latitude}

Longitudine:
${longitude}

Scrie o descriere pentru acest loc:`

        )


      if (
        description === null
      ) {

        return

      }


      if (!user) {

        return

      }


      setStatus(
        '📷 Salvez fotografia...'
      )


      const imagePath =
        await uploadVisitPhoto(
          file
        )


      if (!imagePath) {

        return

      }


      setStatus(
        '💾 Salvez locația...'
      )


      const {
        error
      } =
        await supabase

          .from(
            'visits'
          )

          .insert({

            user_id:
              user.id,

            latitude:
              latitude,

            longitude:
              longitude,

            place_name:
              placeName,

            location_details:
              locationDetails,

            is_peak:
              isPeak,

            peak_elevation:
              peak?.elevation
              ??
              null,

            mountain_range:
              mountainRange,

            description:
              description,

            image_path:
              imagePath,

            visit_date:
                  visitDate

          })


      if (error) {

        console.log(

          'Eroare Supabase:',

          error

        )


        await supabase

          .storage

          .from(
            PHOTO_BUCKET
          )

          .remove([
            imagePath
          ])


        alert(
          'Punctul nu a putut fi salvat.'
        )


        return

      }


      await getVisits()


      if (peak) {

        setStatus(
          `✅ ${peak.name} a fost adăugat 🏔️`
        )


        alert(
          `Vârful ${peak.name} a fost adăugat! 🏔️`
        )

      }

      else {

        setStatus(
          '✅ Locația a fost adăugată.'
        )


        alert(
          'Locul a fost adăugat pe hartă! 📍'
        )

      }

    }

    catch (error) {

      console.log(

        'Eroare fotografie:',

        error

      )


      alert(
        'Nu am putut procesa fotografia.'
      )


      setStatus(
        '❌ A apărut o eroare.'
      )

    }

    finally {

      setProcessing(
        false
      )

    }

  }


  // ===================================================
  // DELETE
  // ===================================================

  async function deleteVisit(
    visit: any
  ) {

    const confirmed =
      window.confirm(
        'Sigur vrei să ștergi această locație și fotografia ei?'
      )


    if (!confirmed) {

      return

    }


    if (
      visit.image_path
    ) {

      const {
        error:
          photoError
      } =
        await supabase

          .storage

          .from(
            PHOTO_BUCKET
          )

          .remove([
            visit.image_path
          ])


      if (
        photoError
      ) {

        console.log(

          'Eroare fotografie:',

          photoError

        )


        alert(
          `Fotografia nu a putut fi ștearsă:\n${photoError.message}`
        )


        return

      }

    }


    const {
      error
    } =
      await supabase

        .from(
          'visits'
        )

        .delete()

        .eq(
          'id',
          visit.id
        )


    if (error) {

      alert(
        'Locația nu a putut fi ștearsă.'
      )


      return

    }


    if (
      selectedVisit?.id ===
      visit.id
    ) {

      setSelectedVisit(
        null
      )

    }


    await getVisits()


    setStatus(
      '✅ Locația a fost ștearsă.'
    )

  }


  // ===================================================
  // NORMALIZARE SEARCH
  // ===================================================

  function normalizeSearchText(
    text: string
  ) {

    return text

      .toLowerCase()

      .normalize(
        'NFD'
      )

      .replace(
        /[\u0300-\u036f]/g,
        ''
      )

      .replace(
        /\bvarful\b/g,
        'vf'
      )

      .replace(
        /\bvarf\b/g,
        'vf'
      )

      .replace(
        /\bvf\./g,
        'vf'
      )

      .replace(
        /[^a-z0-9\s]/g,
        ' '
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim()

  }


  // ===================================================
  // SEARCH ÎN LOCURILE VIZITATE
  // ===================================================

  function searchVisitedPlace() {

    const query =
      normalizeSearchText(
        searchTerm
      )


    if (!query) {

      alert(
        'Scrie numele unei locații.'
      )


      return false

    }


    const foundVisit =
      visits.find(

        (visit) => {

          const searchableText =
            normalizeSearchText(

              `${visit.place_name ?? ''} `

              +

              `${visit.location_details ?? ''} `

              +

              `${visit.description ?? ''}`

            )


          return searchableText
            .includes(
              query
            )

        }

      )


    if (!foundVisit) {

      alert(
        'Nu ai vizitat încă această locație.'
      )


      return false

    }


    if (
      selectedVisit?.id ===
      foundVisit.id
    ) {

      setSelectedVisit(
        null
      )


      window.setTimeout(

        () => {

          setSelectedVisit(
            foundVisit
          )

        },

        20

      )

    }

    else {

      setSelectedVisit(
        foundVisit
      )

    }


    setStatus(

      `✅ Am găsit: ${
        foundVisit.place_name
        ||
        'locația vizitată'
      }`

    )


    return true

  }


  // ===================================================
  // RESET HARTĂ
  // ===================================================

  function resetMap() {

    setSelectedVisit(
      null
    )


    setSearchTerm(
      ''
    )


    setResetMapSignal(

      (value) =>
        value + 1

    )

  }


  // ===================================================
  // LOGOUT
  // ===================================================

  async function logout() {

    await supabase
      .auth
      .signOut()

  }


  // ===================================================
  // HARTĂ / STATISTICI
  // ===================================================

  function toggleStatistics() {

    setShowStatistics(
      (current) =>
        !current
    )


    setProfileOpen(
      false
    )


    setMobileToolsOpen(
      false
    )


    setMobileSearchOpen(
      false
    )


    setAddPopupOpen(
      false
    )

  }


  // ===================================================
  // LOGIN
  // ===================================================

  if (!user) {

    return (
      <Auth />
    )

  }


  // ===================================================
  // POPUP MARKER
  // ===================================================

  function visitPopup(
    visit: any
  ) {

    return (

      <Popup>

        <div className="visit-popup">


          {/* TITLU */}

          <div className="visit-title">

            {
              visit.is_peak
                ? '🏔️'
                : '📍'
            }

            {' '}

            {
              visit.place_name
              ||
              'Loc vizitat'
            }

          </div>


          {/* FOTOGRAFIE */}

          {
            visit.image_path
            &&
            (

              <button

                className="view-photo-button"

                type="button"

                title="Vezi fotografia"

                onClick={(e) => {

                  e.preventDefault()

                  e.stopPropagation()

                  openVisitPhoto(
                    visit
                  )

                }}

              >

                📷

              </button>

            )
          }


          {/* INFO */}

          <div className="visit-info">


            {
              visit.is_peak
              &&
              (

                <>

                  <strong>
                    Altitudine:
                  </strong>

                  {' '}

                  {
                    visit.peak_elevation !==
                    null

                      ? `${visit.peak_elevation} m`

                      : 'necunoscută'
                  }


                  <br />


                  <strong>
                    Masiv:
                  </strong>

                  {' '}

                  {
                    visit.mountain_range
                    ||
                    'nedetectat'
                  }


                  <br />


                  {
                    visit.location_details
                    &&
                    (

                      <>

                        <br />


                        <strong>
                          Locație / traseu:
                        </strong>


                        <br />


                        {
                          visit.location_details
                        }


                        <br />

                      </>

                    )
                  }


                  <br />

                </>

              )
            }


            <strong>
              Data:
            </strong>


            {' '}


            {
              formatVisitDate(
                visit.visit_date
              )
            }


            <br />


            <strong>
              Latitudine:
            </strong>


            {' '}


            {
              visit.latitude
            }


            <br />


            <strong>
              Longitudine:
            </strong>


            {' '}


            {
              visit.longitude
            }

          </div>


          {/* DESCRIERE + DELETE */}

          <div className="popup-bottom">


            <div className="description">

              <strong>
                Descriere:
              </strong>


              <br />


              {
                visit.description
                ||
                'Fără descriere'
              }

            </div>


            <button

              className="delete-button"

              type="button"

              onClick={() =>
                deleteVisit(
                  visit
                )
              }

            >

              DELETE

            </button>


          </div>


        </div>

      </Popup>

    )

  }


  // ===================================================
  // UI
  // ===================================================

  return (

    <div className="peakquest-app">


      {/* =================================================
          HEADER
      ================================================= */}

      <header className="topbar">


        <h1 className="logo">

          PeakQuest

          <span className="logo-mountain">
            🏔️
          </span>

        </h1>


        <div className="user-area">


          <button

            className="user-button"

            type="button"

            onClick={() =>
              setProfileOpen(
                !profileOpen
              )
            }

          >

            <span className="user-email">

              👤 Logat ca: {user.email}

            </span>


            <span>
              ▾
            </span>

          </button>


          <button

            className={
              showStatistics
                ? 'statistics-toggle-button active'
                : 'statistics-toggle-button'
            }

            type="button"

            aria-pressed={
              showStatistics
            }

            onClick={
              toggleStatistics
            }

          >

            {
              showStatistics
                ? '🗺️ Înapoi la hartă'
                : '📊 Statistici'
            }

          </button>


          {
            profileOpen
            &&
            (

              <div className="user-dropdown">

                <button

                  className="logout-button"

                  type="button"

                  onClick={
                    logout
                  }

                >

                  ↪ Deconectare

                </button>

              </div>

            )
          }


        </div>


      </header>


      {/* =================================================
          HARTA
      ================================================= */}

      {
        !showStatistics
        ? (

          <div className="map-wrapper">


        {/* =================================================
            DESKTOP
        ================================================= */}

        <div className="map-panel">


          <label

            className={
              processing
                ? 'photo-button processing'
                : 'photo-button'
            }

          >

            {
              processing

                ? '⏳ Identific locația...'

                : '📷 Adaugă fotografie'
            }


            <input

              type="file"

              accept="image/*"

              disabled={
                processing
              }

              style={{
                display:
                  'none'
              }}

              onChange={(e) => {

                const file =
                  e.target
                    .files?.[0]


                if (file) {

                  handlePhoto(
                    file
                  )

                }


                e.target.value =
                  ''

              }}

            />

          </label>


          {
            status
            &&
            (

              <div

                className={
                  status.includes('✅')
                    ? 'status-box success'
                    : 'status-box'
                }

              >

                {status}

              </div>

            )
          }


          <div className="search-row">


            <div className="search-box">


              <span className="search-icon">

                🔍

              </span>


              <input

                type="text"

                placeholder="Caută un loc vizitat..."

                value={
                  searchTerm
                }

                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }

                onKeyDown={(e) => {

                  if (
                    e.key ===
                    'Enter'
                  ) {

                    searchVisitedPlace()

                  }

                }}

              />

            </div>


            <button

              className="small-map-button"

              type="button"

              title="Caută"

              onClick={
                searchVisitedPlace
              }

            >

              🔎

            </button>


            <button

              className="small-map-button"

              type="button"

              title="Arată România"

              onClick={
                resetMap
              }

            >

              ◎

            </button>


          </div>


        </div>


        {/* =================================================
            MOBIL - BUTON MENIU
        ================================================= */}

        <button

          className={
            mobileToolsOpen
              ? 'mobile-tools-toggle active'
              : 'mobile-tools-toggle'
          }

          type="button"

          title={
            mobileToolsOpen
              ? 'Închide meniul'
              : 'Deschide meniul'
          }

          onClick={() => {

            setMobileToolsOpen(
              !mobileToolsOpen
            )


            if (
              mobileToolsOpen
            ) {

              setMobileSearchOpen(
                false
              )

            }

          }}

        >

          ◎

        </button>


        {/* =================================================
            MOBIL - CAMERA + SEARCH
        ================================================= */}

        {
          mobileToolsOpen
          &&
          (

            <div className="mobile-tools-bar">


              {/* CAMERA */}

              <button

                className="mobile-square-tool"

                type="button"

                title="Adaugă fotografie"

                onClick={() =>
                  setAddPopupOpen(
                    true
                  )
                }

              >

                📷

              </button>


              {/* SEARCH */}

              <button

                className="mobile-square-tool"

                type="button"

                title="Caută un loc"

                onClick={() =>
                  setMobileSearchOpen(
                    true
                  )
                }

              >

                🔍

              </button>


            </div>

          )
        }


        {/* =================================================
            POPUP SEARCH MOBIL
        ================================================= */}

        {
          mobileSearchOpen
          &&
          (

            <div

              className="mobile-search-overlay"

              onClick={() =>
                setMobileSearchOpen(
                  false
                )
              }

            >


              <div

                className="mobile-search-modal"

                onClick={(e) =>
                  e.stopPropagation()
                }

              >


                <button

                  className="mobile-search-close"

                  type="button"

                  onClick={() =>
                    setMobileSearchOpen(
                      false
                    )
                  }

                >

                  ×

                </button>


                <div className="mobile-search-modal-icon">

                  🔍

                </div>


                <h2>

                  Caută un loc vizitat

                </h2>


                <p>

                  Poți căuta doar în locațiile pe care le-ai vizitat deja.

                </p>


                <div className="mobile-search-input-row">


                  <input

                    autoFocus

                    type="text"

                    placeholder="Ex: vf omu"

                    value={
                      searchTerm
                    }

                    onChange={(e) =>
                      setSearchTerm(
                        e.target.value
                      )
                    }

                    onKeyDown={(e) => {

                      if (
                        e.key ===
                        'Enter'
                      ) {

                        const found =
                          searchVisitedPlace()


                        if (found) {

                          setMobileSearchOpen(
                            false
                          )

                        }

                      }

                    }}

                  />


                  <button

                    type="button"

                    onClick={() => {

                      const found =
                        searchVisitedPlace()


                      if (found) {

                        setMobileSearchOpen(
                          false
                        )

                      }

                    }}

                  >

                    🔍

                  </button>


                </div>


              </div>


            </div>

          )
        }


        {/* =================================================
            POPUP ADAUGĂ FOTOGRAFIE
        ================================================= */}

        {
          addPopupOpen
          &&
          (

            <div

              className="mobile-add-overlay"

              onClick={() =>
                setAddPopupOpen(
                  false
                )
              }

            >


              <div

                className="mobile-add-modal"

                onClick={(e) =>
                  e.stopPropagation()
                }

              >


                <button

                  className="mobile-modal-close"

                  type="button"

                  onClick={() =>
                    setAddPopupOpen(
                      false
                    )
                  }

                >

                  ×

                </button>


                <div className="mobile-modal-icon">

                  📷

                </div>


                <h2>

                  Adaugă o locație

                </h2>


                <p>

                  Alege o fotografie care conține coordonate GPS.

                </p>


                <label

                  className={
                    processing
                      ? 'mobile-photo-button processing'
                      : 'mobile-photo-button'
                  }

                >

                  {
                    processing

                      ? '⏳ Identific locația...'

                      : '📷 Alege fotografia'
                  }


                  <input

                    type="file"

                    accept="image/*"

                    disabled={
                      processing
                    }

                    style={{
                      display:
                        'none'
                    }}

                    onChange={(e) => {

                      const file =
                        e.target
                          .files?.[0]


                      if (file) {

                        setAddPopupOpen(
                          false
                        )


                        handlePhoto(
                          file
                        )

                      }


                      e.target.value =
                        ''

                    }}

                  />

                </label>


              </div>


            </div>

          )
        }


        {/* =================================================
            STATUS MOBIL
        ================================================= */}

        {
          status
          &&
          (

            <div

              className={
                status.includes('✅')
                  ? 'mobile-map-status success'
                  : 'mobile-map-status'
              }

            >

              {status}

            </div>

          )
        }


        {/* =================================================
            HARTA LEAFLET
        ================================================= */}

        <MapContainer

          center={
            ROMANIA_CENTER
          }

          zoom={
            7
          }

          className="leaflet-map"

        >


          <TileLayer

            attribution="&copy; OpenStreetMap contributors"

            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

          />


          <MapController

            selectedVisit={
              selectedVisit
            }

            resetSignal={
              resetMapSignal
            }

          />


          <ZoomAwareMarkers

            visits={
              visits
            }

            renderPopup={
              visitPopup
            }

          />


        </MapContainer>


          </div>

        )
        : (

          <div className="statistics-wrapper">

            <Statistics
              visits={
                visits
              }
            />

          </div>

        )
      }


      {/* =================================================
          DATA VIZITEI
      ================================================= */}

      {
        visitDateModalOpen
        &&
        (

          <div

            style={{

              position:
                'fixed',

              inset:
                0,

              zIndex:
                100001,

              display:
                'flex',

              alignItems:
                'center',

              justifyContent:
                'center',

              padding:
                '20px',

              background:
                'rgba(0, 0, 0, 0.62)'

            }}

          >


            <div

              style={{

                position:
                  'relative',

                width:
                  'min(430px, 100%)',

                padding:
                  '24px',

                borderRadius:
                  '20px',

                background:
                  '#202326',

                border:
                  '1px solid rgba(255,255,255,0.12)',

                boxShadow:
                  '0 18px 60px rgba(0,0,0,0.45)',

                color:
                  '#ffffff'

              }}

            >


              <button

                type="button"

                aria-label="Închide"

                onClick={() =>
                  resolveVisitDate(
                    null
                  )
                }

                style={{

                  position:
                    'absolute',

                  top:
                    '10px',

                  right:
                    '12px',

                  width:
                    '32px',

                  height:
                    '32px',

                  border:
                    'none',

                  borderRadius:
                    '50%',

                  background:
                    'rgba(255,255,255,0.08)',

                  color:
                    '#ffffff',

                  fontSize:
                    '20px',

                  cursor:
                    'pointer'

                }}

              >

                ×

              </button>


              <div

                style={{

                  marginBottom:
                    '6px',

                  fontSize:
                    '12px',

                  fontWeight:
                    800,

                  letterSpacing:
                    '0.12em',

                  textTransform:
                    'uppercase',

                  color:
                    '#8ad2b2'

                }}

              >

                PeakQuest

              </div>


              <h2

                style={{

                  margin:
                    '0 0 8px',

                  fontSize:
                    '22px'

                }}

              >

                Data vizitei

              </h2>


              <p

                style={{

                  margin:
                    '0 0 18px',

                  color:
                    '#b8c0c4',

                  lineHeight:
                    1.5

                }}

              >

                Alege ziua, luna și anul în care ai făcut drumeția.
                Dacă fotografia conține data în EXIF, câmpul este completat automat.

              </p>


              <input

                type="date"

                value={
                  visitDateValue
                }

                max={
                  getTodayInputDate()
                }

                onChange={(e) =>
                  setVisitDateValue(
                    e.target.value
                  )
                }

                style={{

                  width:
                    '100%',

                  boxSizing:
                    'border-box',

                  marginBottom:
                    '18px',

                  padding:
                    '13px 14px',

                  borderRadius:
                    '12px',

                  border:
                    '1px solid rgba(255,255,255,0.16)',

                  background:
                    '#151719',

                  color:
                    '#ffffff',

                  fontSize:
                    '16px',

                  outline:
                    'none',

                  colorScheme:
                    'dark'

                }}

              />


              <button

                type="button"

                onClick={() =>
                  resolveVisitDate(
                    visitDateValue
                  )
                }

                style={{

                  width:
                    '100%',

                  padding:
                    '13px 16px',

                  border:
                    'none',

                  borderRadius:
                    '12px',

                  background:
                    '#7fc8a9',

                  color:
                    '#111614',

                  fontSize:
                    '15px',

                  fontWeight:
                    800,

                  cursor:
                    'pointer'

                }}

              >

                Continuă

              </button>


            </div>


          </div>

        )
      }


      {/* =================================================
          ALEGERE TIP LOCAȚIE
      ================================================= */}

      {
        locationTypeModalOpen
        &&
        (

          <div

            style={{

              position:
                'fixed',

              inset:
                0,

              zIndex:
                100000,

              display:
                'flex',

              alignItems:
                'center',

              justifyContent:
                'center',

              padding:
                '20px',

              background:
                'rgba(0, 0, 0, 0.62)'

            }}

          >


            <div

              style={{

                position:
                  'relative',

                width:
                  'min(430px, 100%)',

                padding:
                  '24px',

                borderRadius:
                  '20px',

                background:
                  '#202326',

                border:
                  '1px solid rgba(255,255,255,0.12)',

                boxShadow:
                  '0 18px 60px rgba(0,0,0,0.45)',

                color:
                  '#ffffff'

              }}

            >


              <button

                type="button"

                aria-label="Închide"

                onClick={() =>
                  resolveLocationType(
                    null
                  )
                }

                style={{

                  position:
                    'absolute',

                  top:
                    '10px',

                  right:
                    '12px',

                  width:
                    '32px',

                  height:
                    '32px',

                  border:
                    'none',

                  borderRadius:
                    '50%',

                  background:
                    'rgba(255,255,255,0.08)',

                  color:
                    '#ffffff',

                  fontSize:
                    '20px',

                  cursor:
                    'pointer'

                }}

              >

                ×

              </button>


              <div

                style={{

                  marginBottom:
                    '6px',

                  fontSize:
                    '12px',

                  fontWeight:
                    800,

                  letterSpacing:
                    '0.12em',

                  textTransform:
                    'uppercase',

                  color:
                    '#8ad2b2'

                }}

              >

                PeakQuest

              </div>


              <h2

                style={{

                  margin:
                    '0 0 8px',

                  fontSize:
                    '22px'

                }}

              >

                Ce tip de locație ai vizitat?

              </h2>


              <p

                style={{

                  margin:
                    '0 0 20px',

                  color:
                    '#b8c0c4',

                  lineHeight:
                    1.5

                }}

              >

                Alege cum vrei să fie salvată fotografia pe hartă.

              </p>


              <div

                style={{

                  display:
                    'grid',

                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(160px, 1fr))',

                  gap:
                    '12px'

                }}

              >


                <button

                  type="button"

                  onClick={() =>
                    resolveLocationType(
                      'peak'
                    )
                  }

                  style={{

                    minHeight:
                      '118px',

                    padding:
                      '16px',

                    border:
                      '1px solid rgba(255,255,255,0.13)',

                    borderRadius:
                      '16px',

                    background:
                      '#2a2e31',

                    color:
                      '#ffffff',

                    textAlign:
                      'left',

                    cursor:
                      'pointer'

                  }}

                >

                  <div

                    style={{

                      marginBottom:
                        '10px',

                      fontSize:
                        '34px'

                    }}

                  >

                    🏔️

                  </div>


                  <strong

                    style={{

                      display:
                        'block',

                      marginBottom:
                        '5px',

                      fontSize:
                        '15px'

                    }}

                  >

                    Este un vârf

                  </strong>


                  <span

                    style={{

                      color:
                        '#aeb6ba',

                      fontSize:
                        '12px'

                    }}

                  >

                    Intră la vârfurile vizitate și în statistici.

                  </span>

                </button>


                <button

                  type="button"

                  onClick={() =>
                    resolveLocationType(
                      'place'
                    )
                  }

                  style={{

                    minHeight:
                      '118px',

                    padding:
                      '16px',

                    border:
                      '1px solid rgba(255,255,255,0.13)',

                    borderRadius:
                      '16px',

                    background:
                      '#2a2e31',

                    color:
                      '#ffffff',

                    textAlign:
                      'left',

                    cursor:
                      'pointer'

                  }}

                >

                  <div

                    style={{

                      marginBottom:
                        '10px',

                      fontSize:
                        '34px'

                    }}

                  >

                    📍

                  </div>


                  <strong

                    style={{

                      display:
                        'block',

                      marginBottom:
                        '5px',

                      fontSize:
                        '15px'

                    }}

                  >

                    Altă destinație

                  </strong>


                  <span

                    style={{

                      color:
                        '#aeb6ba',

                      fontSize:
                        '12px'

                    }}

                  >

                    Lac, cabană, traseu, belvedere sau alt loc vizitat.

                  </span>

                </button>


              </div>


            </div>


          </div>

        )
      }


      {/* =================================================
          PREVIEW FOTOGRAFIE
      ================================================= */}

      {
        selectedImageUrl
        &&
        (

          <div

            className="image-preview-overlay"

            onClick={
              closeImagePreview
            }

          >


            <button

              className="image-preview-close"

              type="button"

              onClick={
                closeImagePreview
              }

            >

              ×

            </button>


            <img

              src={
                selectedImageUrl
              }

              alt="Fotografie locație"

              className="image-preview-full"

              onClick={(e) =>
                e.stopPropagation()
              }

            />


          </div>

        )
      }


      {/* =================================================
          PEAKQUEST CHATBOT
      ================================================= */}

      <ChatBot
        visits={
          visits
        }
      />


    </div>

  )

}


export default App