import { useEffect, useRef, useState } from 'react'

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

/*
  Căutăm vârfuri într-o rază mai mare deoarece
  fotografia poate fi făcută pe traseu, nu exact
  pe coordonatele vârfului.
*/
const PEAK_SEARCH_RADIUS = 8000

/*
  Dacă fotografia este foarte aproape de un vârf,
  îl acceptăm automat.
*/
const PEAK_AUTO_ACCEPT_DISTANCE = 350

/*
  Până la această distanță afișăm vârful ca opțiune
  și lăsăm utilizatorul să confirme ce vârf a vizitat.
*/
const PEAK_CONFIRM_DISTANCE = 8000

/*
  Nu încărcăm utilizatorul cu prea multe opțiuni.
*/
const MAX_PEAK_CANDIDATES = 8

const LOOKUP_TIMEOUT = 10000

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

const PHOTO_BUCKET = 'VISIT-PHOTOS'

const ROMANIA_CENTER: [number, number] = [
  45.8,
  24.9
]


// =====================================================
// TIPURI
// =====================================================

type PeakInfo = {

  name: string

  elevation: number | null

  latitude: number

  longitude: number

  distance: number

  mountainRange: string | null

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


type LocationTypeChoice =
  'peak'
  |
  'normal'
  |
  null




// =====================================================
// WIKIDATA - DATE REALE DESPRE VÂRF
// =====================================================

type WikidataPeakMetadata = {
  elevation: number | null
  mountainRange: string | null
  latitude: number | null
  longitude: number | null
}

const WIKIDATA_API_URL =
  'https://www.wikidata.org/w/api.php'

const wikidataPeakCache =
  new Map<string, WikidataPeakMetadata>()


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


function calculateGeoDistance(

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


async function wikidataSearchIds(
  search: string,
  language: 'ro' | 'en'
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
      await fetch(

        `${WIKIDATA_API_URL}?${params.toString()}`

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
      await fetch(

        `${WIKIDATA_API_URL}?${params.toString()}`

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


    if (
      amount ===
      undefined
      ||
      amount ===
      null
    ) {

      continue

    }


    const parsed =
      Number.parseFloat(
        String(
          amount
        )
      )


    if (
      Number.isFinite(
        parsed
      )
    ) {

      return Math.round(
        parsed
      )

    }

  }


  return null

}


function getWikidataCoordinates(
  entity: any
): {
  latitude: number | null
  longitude: number | null
} {

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


function getWikidataItemClaimIds(
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


function getWikidataEntityNames(
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


function getWikidataEntityLabel(
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


async function getPeakMetadataByName(

  peakName: string,

  photoLatitude: number,

  photoLongitude: number

): Promise<WikidataPeakMetadata> {

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


  const cacheKey =
    normalizePeakLookupName(
      cleanName
    )


  const cached =
    wikidataPeakCache.get(
      cacheKey
    )


  if (
    cached
  ) {

    return cached

  }


  const searchQueries =
    Array.from(
      new Set([
        cleanName,
        `Vârful ${cleanName}`
      ])
    )


  const searchResults =
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
        searchResults.flat()
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

    const empty = {
      elevation:
        null,
      mountainRange:
        null,
      latitude:
        null,
      longitude:
        null
    }


    wikidataPeakCache.set(
      cacheKey,
      empty
    )


    return empty

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
            getWikidataEntityNames(
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
              300

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
              250

          }


          let distance =
            Number.POSITIVE_INFINITY


          if (
            coordinates.latitude !==
            null
            &&
            coordinates.longitude !==
            null
          ) {

            distance =
              calculateGeoDistance(

                photoLatitude,

                photoLongitude,

                coordinates.latitude,

                coordinates.longitude

              )


            /*
              Coordonatele sunt foarte utile la dezambiguizare.
              Omu din Bucegi va fi mult mai aproape de fotografia
              utilizatorului decât o entitate cu același nume
              din altă parte.
            */

            score +=
              Math.min(
                distance /
                1000,
                500
              )

          }

          else {

            score +=
              500

          }


          return {
            entity,
            score,
            elevation,
            coordinates,
            distance
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
        null
    }

  }


  let mountainRange:
    string | null =
    null


  const rangeIds =
    getWikidataItemClaimIds(
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
      getWikidataEntityLabel(
        rangeEntities[0]
      )

  }


  const result: WikidataPeakMetadata = {

    elevation:
      best.elevation,

    mountainRange,

    latitude:
      best.coordinates.latitude,

    longitude:
      best.coordinates.longitude

  }


  wikidataPeakCache.set(
    cacheKey,
    result
  )


  return result

}


// =====================================================
// ICON MUNTE
// =====================================================

const mountainIcon =
  divIcon({

    html: `
      <div
        style="
          font-size: 38px;
          line-height: 38px;
          width: 42px;
          height: 42px;
          text-align: center;
          background: transparent;
          border: none;
        "
      >
        🏔️
      </div>
    `,

    className:
      'mountain-marker',

    iconSize:
      [42, 42],

    iconAnchor:
      [21, 38],

    popupAnchor:
      [0, -38]

  })


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
      ((
        choice: LocationTypeChoice
      ) => void)
      |
      null
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
  // STATUSUL DE SUCCES DISPARE DUPĂ 3 SECUNDE
  // ===================================================

  useEffect(() => {

    if (
      !status ||
      !status.includes('✅')
    ) {

      return

    }


    const timer =
      window.setTimeout(

        () => {

          setStatus('')

        },

        3000

      )


    return () => {

      window.clearTimeout(
        timer
      )

    }

  }, [status])


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

          'created_at',

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


    const loadedVisits =
      data ??
      []


    /*
      IMPORTANT:
      Dacă avem deja un vârf salvat cu is_peak = true,
      dar altitudinea sau masivul lipsesc, încercăm
      automat să le completăm din Wikidata.

      Asta repară inclusiv vârfurile deja salvate,
      fără să fie nevoie să le ștergi și să le adaugi din nou.
    */

    const enrichedVisits =
      await Promise.all(

        loadedVisits.map(

          async (
            visit: any
          ) => {

            if (
              visit.is_peak !==
              true
            ) {

              return visit

            }


            const elevationMissing =

              visit.peak_elevation ===
              null

              ||

              visit.peak_elevation ===
              undefined

              ||

              visit.peak_elevation ===
              ''


            const mountainRangeMissing =

              !visit.mountain_range
              ||
              !String(
                visit.mountain_range
              )
                .trim()


            if (
              !elevationMissing
              &&
              !mountainRangeMissing
            ) {

              return visit

            }


            const peakName =
              String(
                visit.place_name
                ??
                ''
              )
                .trim()


            if (
              !peakName
            ) {

              return visit

            }


            const latitude =
              Number(
                visit.latitude
              )


            const longitude =
              Number(
                visit.longitude
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

              return visit

            }


            const metadata =
              await getPeakMetadataByName(

                peakName,

                latitude,

                longitude

              )


            const updatedVisit = {

              ...visit,

              peak_elevation:

                elevationMissing

                  ? metadata.elevation

                  : visit.peak_elevation,

              mountain_range:

                mountainRangeMissing

                  ? metadata.mountainRange

                  : visit.mountain_range

            }


            const updateData:
              Record<string, any> =
              {}


            if (
              elevationMissing
              &&
              metadata.elevation !==
              null
            ) {

              updateData
                .peak_elevation =
                  metadata.elevation

            }


            if (
              mountainRangeMissing
              &&
              metadata.mountainRange
            ) {

              updateData
                .mountain_range =
                  metadata.mountainRange

            }


            /*
              Încercăm și să persistăm completarea în Supabase.
              Chiar dacă politica UPDATE nu permite momentan,
              UI-ul folosește oricum updatedVisit și va afișa
              altitudinea în sesiunea curentă.
            */

            if (
              Object.keys(
                updateData
              )
                .length >
              0
            ) {

              const {
                error:
                  updateError
              } =
                await supabase

                  .from(
                    'visits'
                  )

                  .update(
                    updateData
                  )

                  .eq(
                    'id',
                    visit.id
                  )

                  .eq(
                    'user_id',
                    user.id
                  )


              if (
                updateError
              ) {

                console.log(
                  'Nu am putut salva metadatele vârfului în Supabase:',
                  updateError
                )

              }

            }


            return updatedVisit

          }

        )

      )


    setVisits(
      enrichedVisits
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
  // CĂUTARE VÂRF
  // ===================================================

  async function getNearbyPeaks(

    latitude: number,

    longitude: number

  ): Promise<PeakInfo[]> {

    const query = `

      [out:json][timeout:10];

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
          !Array.isArray(
            data.elements
          )
        ) {

          continue

        }


        const peaks:
          PeakInfo[] =
          []


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


          if (
            distance >
            PEAK_CONFIRM_DISTANCE
          ) {

            continue

          }


          const name =

            element.tags
              ?.['name:ro']

            ||

            element.tags
              ?.name

            ||

            element.tags
              ?.alt_name

            ||

            'Vârf fără nume'


          /*
            Pentru lista de alegere preferăm
            vârfurile care au un nume.
          */

          if (
            name ===
            'Vârf fără nume'
            &&
            distance >
            PEAK_AUTO_ACCEPT_DISTANCE
          ) {

            continue

          }


          peaks.push({

            name,

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

          })

        }


        peaks.sort(
          (
            a,
            b
          ) =>
            a.distance -
            b.distance
        )


        /*
          Dacă primul server a răspuns și a găsit
          vârfuri, nu mai așteptăm al doilea server.
        */

        if (
          peaks.length >
          0
        ) {

          return peaks.slice(
            0,
            MAX_PEAK_CANDIDATES
          )

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
        'Nu am putut interoga serverele Overpass.',
        lastError
      )

    }


    return []

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
  // ALEGERE TIP LOCAȚIE
  // ===================================================

  function askLocationType() {

    return new Promise<
      LocationTypeChoice
    >(
      (resolve) => {

        locationTypeResolverRef.current =
          resolve


        setLocationTypeModalOpen(
          true
        )

      }
    )

  }


  function resolveLocationType(
    choice: LocationTypeChoice
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

      const gps =
        await exifr.gps(
          file
        )


      if (!gps) {

        alert(
          'Fotografia nu conține coordonate GPS.'
        )


        setStatus(
          ''
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
        overpassPeaks
      ] =
        await Promise.all([

          getReverseLocation(
            latitude,
            longitude
          ),

          getNearbyPeaks(
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


      /*
        Reunim rezultatul Nominatim cu vârfurile
        găsite de Overpass și eliminăm duplicatele.
      */

      const allCandidates:
        PeakInfo[] =
        [

          ...(
            nominatimPeak
              ? [
                  nominatimPeak
                ]
              : []
          ),

          ...overpassPeaks

        ]


      const uniqueCandidates =
        new Map<
          string,
          PeakInfo
        >()


      for (
        const candidate
        of allCandidates
      ) {

        const key =
          candidate.name

            .toLowerCase()

            .normalize(
              'NFD'
            )

            .replace(
              /[\u0300-\u036f]/g,
              ''
            )

            .replace(
              /[^a-z0-9]/g,
              ''
            )


        const existing =
          uniqueCandidates.get(
            key
          )


        if (
          !existing
          ||
          candidate.distance <
          existing.distance
        ) {

          uniqueCandidates.set(
            key,
            candidate
          )

        }

      }


      const peakCandidates =
        Array.from(
          uniqueCandidates.values()
        )

          .sort(
            (
              a,
              b
            ) =>
              a.distance -
              b.distance
          )

          .slice(
            0,
            MAX_PEAK_CANDIDATES
          )


      let peak:
        PeakInfo | null =
        null


      // =================================================
      // UTILIZATORUL ALEGE CLAR TIPUL LOCAȚIEI
      // =================================================

      const locationType =
        await askLocationType()


      /*
        Dacă apasă X în fereastră,
        anulăm adăugarea fotografiei.
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


      // =================================================
      // DACĂ ESTE VÂRF, CEREM NUMELE
      // =================================================

      if (
        locationType ===
        'peak'
      ) {

        const candidateLines =
          peakCandidates

            .map(
              (
                candidate,
                index
              ) => {

                const distanceText =

                  candidate.distance >=
                  1000

                    ? `${
                        (
                          candidate.distance /
                          1000
                        )
                          .toFixed(1)
                      } km`

                    : `${
                        Math.round(
                          candidate.distance
                        )
                      } m`


                const elevationText =

                  candidate.elevation !==
                  null

                    ? ` — ${candidate.elevation} m`

                    : ''


                return (
                  `${
                    index + 1
                  }. ${
                    candidate.name
                  } — ${
                    distanceText
                  }${
                    elevationText
                  }`
                )

              }
            )

            .join(
              '\n'
            )


        const suggestedPeakName =
          peakCandidates[0]
            ?.name
          ??
          ''


        const peakNameInput =
          window.prompt(

`🏔️ Numele vârfului

${
  candidateLines
    ? `Vârfuri găsite în apropiere:\n\n${candidateLines}\n\n`
    : ''
}Scrie numele vârfului pe care l-ai vizitat.

Exemplu:
Omu`,

            suggestedPeakName

          )


        /*
          Cancel = anulăm complet adăugarea.
        */

        if (
          peakNameInput ===
          null
        ) {

          setStatus(
            ''
          )


          return

        }


        const selectedPeakName =
          peakNameInput
            .trim()


        if (
          !selectedPeakName
        ) {

          alert(
            'Scrie numele vârfului.'
          )


          setStatus(
            ''
          )


          return

        }


        const normalizePeakChoice =
          (
            value: string
          ) =>

            value

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
                /[^a-z0-9]/g,
                ''
              )


        const normalizedSelectedName =
          normalizePeakChoice(
            selectedPeakName
          )


        const matchedCandidate =
          peakCandidates.find(
            (
              candidate
            ) =>

              normalizePeakChoice(
                candidate.name
              )
              ===
              normalizedSelectedName
          )


        setStatus(
          `🔎 Caut altitudinea și masivul pentru ${selectedPeakName}...`
        )


        const wikidataMetadata =
          await getPeakMetadataByName(

            selectedPeakName,

            latitude,

            longitude

          )


        if (
          matchedCandidate
        ) {

          peak = {

            ...matchedCandidate,

            elevation:

              matchedCandidate.elevation
              ??
              wikidataMetadata.elevation,

            mountainRange:

              matchedCandidate.mountainRange
              ??
              wikidataMetadata.mountainRange

          }

        }

        else {

          /*
            Dacă vârful a fost scris manual, nu îl mai
            salvăm direct cu altitudine NULL.

            Încercăm mai întâi să luăm altitudinea reală
            și masivul din Wikidata.
          */

          const peakLatitude =

            wikidataMetadata.latitude
            ??
            latitude


          const peakLongitude =

            wikidataMetadata.longitude
            ??
            longitude


          const distanceToPeak =

            wikidataMetadata.latitude !==
            null

            &&

            wikidataMetadata.longitude !==
            null

              ? calculateDistance(

                  latitude,

                  longitude,

                  peakLatitude,

                  peakLongitude

                )

              : 0


          peak = {

            name:
              selectedPeakName,

            elevation:
              wikidataMetadata.elevation,

            latitude:
              peakLatitude,

            longitude:
              peakLongitude,

            distance:
              distanceToPeak,

            mountainRange:
              wikidataMetadata.mountainRange

          }

        }

      }


      // =================================================
      // DACĂ ESTE LOCAȚIE NORMALĂ
      // =================================================

      if (
        locationType ===
        'normal'
      ) {

        peak =
          null

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

              new Date()

                .toISOString()

                .split('T')[0]

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
              visit.visit_date
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
          ALEGERE TIP LOCAȚIE
      ================================================= */}

      {
        locationTypeModalOpen
        &&
        (

          <div
            className="location-type-overlay"
            onClick={() =>
              resolveLocationType(
                null
              )
            }
          >

            <div
              className="location-type-modal"
              onClick={(event) =>
                event.stopPropagation()
              }
            >

              <button
                className="location-type-close"
                type="button"
                title="Anulează"
                onClick={() =>
                  resolveLocationType(
                    null
                  )
                }
              >
                ×
              </button>


              <div className="location-type-icon">
                📍
              </div>


              <h2>
                Ce tip de locație ai vizitat?
              </h2>


              <p>
                Alege dacă fotografia reprezintă un vârf montan sau o locație normală de pe traseu.
              </p>


              <div className="location-type-actions">

                <button
                  className="location-type-option peak"
                  type="button"
                  onClick={() =>
                    resolveLocationType(
                      'peak'
                    )
                  }
                >

                  <span className="location-type-option-icon">
                    🏔️
                  </span>

                  <span>
                    <strong>
                      Este un vârf
                    </strong>

                    <small>
                      Va apărea și în statisticile pentru vârfuri.
                    </small>
                  </span>

                </button>


                <button
                  className="location-type-option normal"
                  type="button"
                  onClick={() =>
                    resolveLocationType(
                      'normal'
                    )
                  }
                >

                  <span className="location-type-option-icon">
                    📍
                  </span>

                  <span>
                    <strong>
                      Locație normală
                    </strong>

                    <small>
                      Cabana, lac, traseu, punct de belvedere etc.
                    </small>
                  </span>

                </button>

              </div>

            </div>

          </div>

        )
      }


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


          {
            visits.map(

              (visit) => {


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
                        visitPopup(
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

                  >

                    {
                      visitPopup(
                        visit
                      )
                    }

                  </Marker>

                )

              }

            )
          }


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