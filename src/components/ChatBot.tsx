import {
  useEffect,
  useRef,
  useState
} from 'react'

import type {
  FormEvent
} from 'react'

import './ChatBot.css'


// =====================================================
// TIPURI
// =====================================================

type Visit = {
  id: string | number

  latitude: number
  longitude: number

  place_name?: string | null
  location_details?: string | null
  description?: string | null

  is_peak?: boolean | null

  peak_elevation?: number | null
  mountain_range?: string | null
}


type ChatBotProps = {
  visits: Visit[]
}


type ChatMessage = {
  id: number

  role:
    'user' |
    'bot'

  text: string
}


type OsmPeak = {
  id: number

  lat: number
  lon: number

  tags?: {
    name?: string
    'name:ro'?: string
    alt_name?: string
    ele?: string

    [key: string]:
      string | undefined
  }
}


type IdentifiedPeak = {
  visitId:
    string | number

  name:
    string

  elevation:
    number

  distance:
    number

  latitude:
    number

  longitude:
    number
}


type ElevationSource =
  'open-meteo-geocoding'
  |
  'open-meteo-dem'
  |
  'osm'
  |
  'nominatim'


type PeakLookupResult = {
  name: string

  elevation:
    number | null

  latitude:
    number

  longitude:
    number

  source:
    ElevationSource
}


type OpenMeteoLocation = {
  id?: number

  name?: string

  latitude?: number
  longitude?: number

  elevation?: number

  feature_code?: string

  country_code?: string

  country?: string

  admin1?: string
}


type OpenMeteoSearchResponse = {
  results?: OpenMeteoLocation[]
}


type OpenMeteoElevationResponse = {
  elevation?: number[]
}


type NominatimResult = {
  lat?: string
  lon?: string

  name?: string

  display_name?: string

  category?: string
  type?: string

  osm_id?: number
  osm_type?: string

  extratags?: {
    ele?: string

    [key: string]:
      string | undefined
  }

  namedetails?: {
    name?: string

    [key: string]:
      string | undefined
  }
}


// =====================================================
// CONFIG
// =====================================================

const OPEN_METEO_GEOCODING_URL =
  'https://geocoding-api.open-meteo.com/v1/search'


const OPEN_METEO_ELEVATION_URL =
  'https://api.open-meteo.com/v1/elevation'


const NOMINATIM_SEARCH_URL =
  'https://nominatim.openstreetmap.org/search'


const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]


// =====================================================
// DISTANȚE
// =====================================================

const VISIT_PEAK_SEARCH_RADIUS =
  1500


const STRICT_PEAK_DISTANCE =
  500


/*
  Dacă numele apare explicit în
  locația salvată:

  "Traseu ... Vârful Omu"

  putem permite o distanță mai mare.
*/

const NAMED_PEAK_MAX_DISTANCE =
  8000


const PEAK_NAME_COORDINATE_RADIUS =
  3000


const REQUEST_TIMEOUT =
  18000


// =====================================================
// CACHE GLOBAL PENTRU CĂUTAREA VÂRFURILOR
// =====================================================

const peakLookupCache =
  new Map<
    string,
    PeakLookupResult
  >()


// =====================================================
// NORMALIZARE TEXT
// =====================================================

function normalizeText(
  text: string
) {

  return text
    .toLowerCase()

    .normalize('NFD')

    .replace(
      /[\u0300-\u036f]/g,
      ''
    )

    // plural
    .replace(
      /\bvarfurile\b/g,
      'vf'
    )

    .replace(
      /\bvarfurilor\b/g,
      'vf'
    )

    .replace(
      /\bvarfuri\b/g,
      'vf'
    )

    // singular
    .replace(
      /\bvarfului\b/g,
      'vf'
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


// =====================================================
// NORMALIZARE NUME VÂRF
// =====================================================

function normalizePeakName(
  text: string
) {

  return normalizeText(
    text
  )
    .replace(
      /^vf\s+/,
      ''
    )

    .trim()

}


// =====================================================
// ALTITUDINE
// =====================================================

function parseElevation(
  value: unknown
): number | null {

  if (
    value === undefined ||
    value === null
  ) {

    return null

  }


  const parsed =
    Number.parseFloat(
      String(value)
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


// =====================================================
// DISTANȚĂ HAVERSINE
// =====================================================

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
    2 *
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


// =====================================================
// FETCH CU TIMEOUT
// =====================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = REQUEST_TIMEOUT
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


// =====================================================
// NUME VÂRF OSM
// =====================================================

function getPeakName(
  peak: OsmPeak
) {

  return (
    peak.tags?.['name:ro']
    ||
    peak.tags?.name
    ||
    peak.tags?.alt_name
    ||
    'Vârf fără nume'
  )

}


// =====================================================
// ESCAPE REGEX
// =====================================================

function escapeRegex(
  text: string
) {

  return text.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  )

}


// =====================================================
// SCOR NUME
// =====================================================

function getNameMatchScore(
  candidateName: string,
  requestedName: string
) {

  const candidate =
    normalizePeakName(
      candidateName
    )


  const requested =
    normalizePeakName(
      requestedName
    )


  if (
    !candidate ||
    !requested
  ) {

    return 100

  }


  if (
    candidate ===
    requested
  ) {

    return 0

  }


  if (
    candidate.startsWith(
      requested
    )
  ) {

    return 1

  }


  if (
    candidate.includes(
      requested
    )
  ) {

    return 2

  }


  if (
    requested.includes(
      candidate
    )
  ) {

    return 3

  }


  const candidateWords =
    candidate
      .split(' ')
      .filter(
        Boolean
      )


  const requestedWords =
    requested
      .split(' ')
      .filter(
        Boolean
      )


  const commonWords =
    requestedWords.filter(
      (word) =>
        candidateWords.includes(
          word
        )
    )


  if (
    commonWords.length >
    0
  ) {

    return 10

  }


  return 100

}


// =====================================================
// EXTRAGEM NUMELE VÂRFULUI DIN ÎNTREBARE
// =====================================================

function extractPeakName(
  question: string
) {

  let text =
    normalizeText(
      question
    )


  const phrases = [
    'ce altitudine are',
    'care este altitudinea',
    'care e altitudinea',

    'ce inaltime are',
    'care este inaltimea',
    'care e inaltimea',

    'cat de inalt este',
    'cat de inalt e',
    'cat de inalt',

    'unde este',
    'unde e',
    'unde se afla',

    'am fost pe',
    'am fost la',
    'am vizitat',

    'spune mi',
    'spunemi',

    'altitudinea',
    'altitudine',

    'inaltimea',
    'inaltime',

    'te rog',

    'vf'
  ]


  for (
    const phrase
    of phrases
  ) {

    text =
      text.replace(
        phrase,
        ' '
      )

  }


  return text
    .replace(
      /\s+/g,
      ' '
    )
    .trim()

}


// =====================================================
// EXTRAGEM NUMELE VÂRFULUI DINTR-O VIZITĂ
// =====================================================

function extractPeakNameFromVisit(
  visit: Visit
) {

  const text =
    `${visit.place_name ?? ''} ${visit.location_details ?? ''}`


  /*
    Exemple:

    Vârful Omu
    Varful Omu
    Vf. Omu
  */

  const match =
    text.match(
      /(?:Vârful|Varful|Vf\.?)\s+([^,;()–—-]+)/i
    )


  if (
    match?.[1]
  ) {

    const result =
      match[1]
        .trim()


    if (
      result.length >=
      2
    ) {

      return result

    }

  }


  if (
    visit.is_peak &&
    visit.place_name
  ) {

    return visit.place_name

  }


  return null

}


// =====================================================
// OVERPASS CU FALLBACK
// =====================================================

async function runOverpassQuery(
  query: string
): Promise<OsmPeak[]> {

  let lastError:
    unknown = null


  for (
    const url
    of OVERPASS_URLS
  ) {

    try {

      const response =
        await fetchWithTimeout(
          url,
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
          }
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


      return (
        data.elements ??
        []
      )

    }

    catch (error) {

      lastError =
        error


      console.log(
        `Overpass indisponibil: ${url}`,
        error
      )

    }

  }


  throw (
    lastError
    ??
    new Error(
      'Overpass indisponibil.'
    )
  )

}


// =====================================================
// OPEN-METEO - ELEVAȚIE DUPĂ COORDONATE
// =====================================================

async function getOpenMeteoElevation(
  latitude: number,
  longitude: number
): Promise<number | null> {

  try {

    const params =
      new URLSearchParams({
        latitude:
          String(
            latitude
          ),

        longitude:
          String(
            longitude
          )
      })


    const response =
      await fetchWithTimeout(
        `${OPEN_METEO_ELEVATION_URL}?${params.toString()}`
      )


    if (
      !response.ok
    ) {

      return null

    }


    const data:
      OpenMeteoElevationResponse =
      await response.json()


    if (
      !Array.isArray(
        data.elevation
      )
    ) {

      return null

    }


    return parseElevation(
      data.elevation[0]
    )

  }

  catch (error) {

    console.log(
      'Open-Meteo elevation error:',
      error
    )


    return null

  }

}


// =====================================================
// SCOR PENTRU REZULTAT OPEN-METEO
// =====================================================

function scoreOpenMeteoLocation(
  location: OpenMeteoLocation,
  requestedName: string
) {

  const name =
    location.name ??
    ''


  let score =
    getNameMatchScore(
      name,
      requestedName
    )


  const featureCode =
    String(
      location.feature_code ??
      ''
    )
      .toUpperCase()


  /*
    GeoNames folosește feature_code.

    PK / PKS = peak(s)
    MT = mountain
  */

  if (
    featureCode ===
    'PK'
  ) {

    score -=
      50

  }


  if (
    featureCode ===
    'PKS'
  ) {

    score -=
      40

  }


  if (
    featureCode ===
    'MT'
  ) {

    score -=
      30

  }


  if (
    featureCode.startsWith(
      'PK'
    )
  ) {

    score -=
      20

  }


  if (
    String(
      location.country_code ??
      ''
    )
      .toUpperCase() ===
    'RO'
  ) {

    score -=
      5

  }


  return score

}


// =====================================================
// OPEN-METEO - CĂUTARE VÂRF DUPĂ NUME
// =====================================================

async function findPeakWithOpenMeteo(
  requestedName: string
): Promise<PeakLookupResult | null> {

  const cleanName =
    normalizePeakName(
      requestedName
    )


  if (!cleanName) {

    return null

  }


  /*
    Încercăm două forme.

    De obicei:
    "Negoiu"

    este mai bun decât:
    "Vârful Negoiu".
  */

  const searchVariants = [
    cleanName,
    `Vârful ${cleanName}`
  ]


  let allResults:
    OpenMeteoLocation[] = []


  for (
    const searchName
    of searchVariants
  ) {

    try {

      const params =
        new URLSearchParams({
          name:
            searchName,

          count:
            '30',

          language:
            'ro',

          format:
            'json',

          countryCode:
            'RO'
        })


      const response =
        await fetchWithTimeout(
          `${OPEN_METEO_GEOCODING_URL}?${params.toString()}`
        )


      if (
        !response.ok
      ) {

        continue

      }


      const data:
        OpenMeteoSearchResponse =
        await response.json()


      if (
        Array.isArray(
          data.results
        )
      ) {

        allResults.push(
          ...data.results
        )

      }

    }

    catch (error) {

      console.log(
        'Open-Meteo geocoding error:',
        error
      )

    }


    /*
      Dacă prima căutare a dat
      rezultate, nu mai facem inutil
      încă un request.
    */

    if (
      allResults.length >
      0
    ) {

      break

    }

  }


  if (
    allResults.length ===
    0
  ) {

    return null

  }


  // ===================================================
  // ELIMINĂM DUPLICATE
  // ===================================================

  const uniqueResults =
    new Map<
      string,
      OpenMeteoLocation
    >()


  for (
    const result
    of allResults
  ) {

    const key =
      `${result.id ?? ''}-${result.latitude ?? ''}-${result.longitude ?? ''}`


    uniqueResults.set(
      key,
      result
    )

  }


  // ===================================================
  // SORTARE
  // ===================================================

  const ranked =
    Array.from(
      uniqueResults.values()
    )

      .filter(
        (item) =>
          Number.isFinite(
            Number(
              item.latitude
            )
          )
          &&
          Number.isFinite(
            Number(
              item.longitude
            )
          )
      )

      .map(
        (item) => ({
          item,

          score:
            scoreOpenMeteoLocation(
              item,
              cleanName
            )
        })
      )

      .sort(
        (a, b) =>
          a.score -
          b.score
      )


  if (
    ranked.length ===
    0
  ) {

    return null

  }


  /*
    Nu acceptăm un rezultat care
    nu seamănă deloc cu numele.
  */

  const acceptable =
    ranked.find(
      (candidate) =>
        candidate.score <
        100
    )


  const best =
    acceptable
    ??
    ranked[0]


  if (
    !best
  ) {

    return null

  }


  const latitude =
    Number(
      best.item.latitude
    )


  const longitude =
    Number(
      best.item.longitude
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


  let elevation =
    parseElevation(
      best.item.elevation
    )


  let source:
    ElevationSource =
      'open-meteo-geocoding'


  // ===================================================
  // DACĂ NU AVEM ELEVAȚIE
  // ===================================================

  if (
    elevation ===
    null
  ) {

    elevation =
      await getOpenMeteoElevation(
        latitude,
        longitude
      )


    if (
      elevation !==
      null
    ) {

      source =
        'open-meteo-dem'

    }

  }


  return {
    name:
      best.item.name
      ||
      requestedName,

    elevation,

    latitude,

    longitude,

    source
  }

}


// =====================================================
// NOMINATIM - CĂUTARE DUPĂ NUME
// =====================================================

async function findPeakWithNominatim(
  requestedName: string
): Promise<PeakLookupResult | null> {

  try {

    const cleanName =
      normalizePeakName(
        requestedName
      )


    const params =
      new URLSearchParams({
        q:
          `Vârful ${cleanName}, România`,

        format:
          'jsonv2',

        limit:
          '10',

        addressdetails:
          '1',

        extratags:
          '1',

        namedetails:
          '1',

        countrycodes:
          'ro',

        'accept-language':
          'ro'
      })


    const response =
      await fetchWithTimeout(
        `${NOMINATIM_SEARCH_URL}?${params.toString()}`
      )


    if (
      !response.ok
    ) {

      return null

    }


    const results:
      NominatimResult[] =
      await response.json()


    if (
      !Array.isArray(
        results
      )
      ||
      results.length ===
      0
    ) {

      return null

    }


    const ranked =
      results

        .map(
          (item) => {

            const candidateName =
              item.name
              ||
              item.namedetails?.name
              ||
              item.display_name
                ?.split(',')[0]
              ||
              cleanName


            let score =
              getNameMatchScore(
                candidateName,
                cleanName
              )


            if (
              item.type ===
              'peak'
            ) {

              score -=
                50

            }


            if (
              item.category ===
              'natural'
            ) {

              score -=
                20

            }


            return {
              item,
              candidateName,
              score
            }

          }
        )

        .sort(
          (a, b) =>
            a.score -
            b.score
        )


    const best =
      ranked[0]


    if (!best) {

      return null

    }


    const latitude =
      Number.parseFloat(
        best.item.lat ??
        ''
      )


    const longitude =
      Number.parseFloat(
        best.item.lon ??
        ''
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


    return {
      name:
        best.candidateName,

      elevation:
        parseElevation(
          best.item
            .extratags
            ?.ele
        ),

      latitude,

      longitude,

      source:
        'nominatim'
    }

  }

  catch (error) {

    console.log(
      'Nominatim search error:',
      error
    )


    return null

  }

}


// =====================================================
// OVERPASS - CĂUTARE ÎN JURUL COORDONATELOR
// =====================================================

async function findPeakNearCoordinates(
  latitude: number,
  longitude: number,
  requestedName: string,
  radius =
    PEAK_NAME_COORDINATE_RADIUS
): Promise<PeakLookupResult | null> {

  try {

    const query = `
      [out:json][timeout:15];

      node(
        around:${radius},
        ${latitude},
        ${longitude}
      )
      ["natural"="peak"];

      out body;
    `


    const peaks =
      await runOverpassQuery(
        query
      )


    if (
      peaks.length ===
      0
    ) {

      return null

    }


    const ranked =
      peaks

        .map(
          (peak) => {

            const name =
              getPeakName(
                peak
              )


            const distance =
              calculateDistance(
                latitude,
                longitude,
                peak.lat,
                peak.lon
              )


            const nameScore =
              getNameMatchScore(
                name,
                requestedName
              )


            return {
              peak,
              name,
              distance,
              nameScore,

              score:
                (
                  nameScore *
                  100000
                )
                +
                distance
            }

          }
        )

        .sort(
          (a, b) =>
            a.score -
            b.score
        )


    if (
      ranked.length ===
      0
    ) {

      return null

    }


    const matching =
      ranked.find(
        (candidate) =>
          candidate.nameScore <=
          10
      )


    const best =
      matching
      ??
      ranked[0]


    if (
      best.nameScore >=
      100
      &&
      best.distance >
      800
    ) {

      return null

    }


    let elevation =
      parseElevation(
        best.peak
          .tags
          ?.ele
      )


    let source:
      ElevationSource =
        'osm'


    /*
      Dacă OSM găsește vârful,
      dar ele lipsește,
      folosim DEM-ul Open-Meteo.
    */

    if (
      elevation ===
      null
    ) {

      elevation =
        await getOpenMeteoElevation(
          best.peak.lat,
          best.peak.lon
        )


      if (
        elevation !==
        null
      ) {

        source =
          'open-meteo-dem'

      }

    }


    return {
      name:
        best.name,

      elevation,

      latitude:
        best.peak.lat,

      longitude:
        best.peak.lon,

      source
    }

  }

  catch (error) {

    console.log(
      'Peak near coordinates error:',
      error
    )


    return null

  }

}


// =====================================================
// OVERPASS - CĂUTARE DIRECTĂ DUPĂ NUME
// =====================================================

async function findPeakByNameOverpass(
  requestedName: string
): Promise<PeakLookupResult | null> {

  try {

    const cleanName =
      normalizePeakName(
        requestedName
      )


    const safeName =
      escapeRegex(
        cleanName
      )


    const query = `
      [out:json][timeout:15];

      (
        node
          ["natural"="peak"]
          ["name"~"${safeName}",i]
          (43.5,20.0,48.5,30.0);

        node
          ["natural"="peak"]
          ["name:ro"~"${safeName}",i]
          (43.5,20.0,48.5,30.0);

        node
          ["natural"="peak"]
          ["alt_name"~"${safeName}",i]
          (43.5,20.0,48.5,30.0);
      );

      out body;
    `


    const peaks =
      await runOverpassQuery(
        query
      )


    if (
      peaks.length ===
      0
    ) {

      return null

    }


    const ranked =
      peaks

        .map(
          (peak) => ({
            peak,

            name:
              getPeakName(
                peak
              ),

            score:
              getNameMatchScore(
                getPeakName(
                  peak
                ),
                cleanName
              )
          })
        )

        .sort(
          (a, b) =>
            a.score -
            b.score
        )


    const best =
      ranked[0]


    if (!best) {

      return null

    }


    let elevation =
      parseElevation(
        best.peak
          .tags
          ?.ele
      )


    let source:
      ElevationSource =
        'osm'


    if (
      elevation ===
      null
    ) {

      elevation =
        await getOpenMeteoElevation(
          best.peak.lat,
          best.peak.lon
        )


      if (
        elevation !==
        null
      ) {

        source =
          'open-meteo-dem'

      }

    }


    return {
      name:
        best.name,

      elevation,

      latitude:
        best.peak.lat,

      longitude:
        best.peak.lon,

      source
    }

  }

  catch (error) {

    console.log(
      'Overpass name search error:',
      error
    )


    return null

  }

}


// =====================================================
// CĂUTARE COMPLETĂ VÂRF DUPĂ NUME
// =====================================================

async function findPeakByName(
  requestedName: string
): Promise<PeakLookupResult | null> {

  const cleanName =
    normalizePeakName(
      requestedName
    )


  if (!cleanName) {

    return null

  }


  // ===================================================
  // CACHE
  // ===================================================

  const cached =
    peakLookupCache.get(
      cleanName
    )


  if (cached) {

    return cached

  }


  // ===================================================
  // 1. OPEN-METEO
  // ===================================================

  const openMeteo =
    await findPeakWithOpenMeteo(
      cleanName
    )


  if (
    openMeteo &&
    openMeteo.elevation !==
    null
  ) {

    peakLookupCache.set(
      cleanName,
      openMeteo
    )


    return openMeteo

  }


  // ===================================================
  // 2. DACĂ OPEN-METEO A GĂSIT COORDONATELE,
  //    VERIFICĂM ȘI OSM ÎN JUR
  // ===================================================

  if (
    openMeteo
  ) {

    const around =
      await findPeakNearCoordinates(
        openMeteo.latitude,
        openMeteo.longitude,
        cleanName
      )


    if (
      around &&
      around.elevation !==
      null
    ) {

      peakLookupCache.set(
        cleanName,
        around
      )


      return around

    }

  }


  // ===================================================
  // 3. NOMINATIM
  // ===================================================

  const nominatim =
    await findPeakWithNominatim(
      cleanName
    )


  if (
    nominatim
  ) {

    if (
      nominatim.elevation !==
      null
    ) {

      peakLookupCache.set(
        cleanName,
        nominatim
      )


      return nominatim

    }


    const around =
      await findPeakNearCoordinates(
        nominatim.latitude,
        nominatim.longitude,
        cleanName
      )


    if (
      around &&
      around.elevation !==
      null
    ) {

      peakLookupCache.set(
        cleanName,
        around
      )


      return around

    }

  }


  // ===================================================
  // 4. OVERPASS DUPĂ NUME
  // ===================================================

  const overpass =
    await findPeakByNameOverpass(
      cleanName
    )


  if (
    overpass
  ) {

    peakLookupCache.set(
      cleanName,
      overpass
    )


    return overpass

  }


  // ===================================================
  // 5. DACĂ OPEN-METEO A GĂSIT MĂCAR LOCAȚIA
  // ===================================================

  if (
    openMeteo
  ) {

    peakLookupCache.set(
      cleanName,
      openMeteo
    )


    return openMeteo

  }


  return null

}


// =====================================================
// CĂUTARE VÂRFURI ÎN JURUL VIZITELOR
// =====================================================

async function getPeaksNearVisits(
  visits: Visit[]
) {

  const validVisits =
    visits.filter(
      (visit) => {

        const latitude =
          Number(
            visit.latitude
          )


        const longitude =
          Number(
            visit.longitude
          )


        return (
          Number.isFinite(
            latitude
          )
          &&
          Number.isFinite(
            longitude
          )
        )

      }
    )


  if (
    validVisits.length ===
    0
  ) {

    return []

  }


  const CHUNK_SIZE =
    10


  const allPeaks:
    OsmPeak[] = []


  for (
    let index = 0;
    index < validVisits.length;
    index += CHUNK_SIZE
  ) {

    const chunk =
      validVisits.slice(
        index,
        index + CHUNK_SIZE
      )


    const aroundQueries =
      chunk
        .map(
          (visit) => `
            node(
              around:${VISIT_PEAK_SEARCH_RADIUS},
              ${Number(visit.latitude)},
              ${Number(visit.longitude)}
            )
            ["natural"="peak"];
          `
        )
        .join('\n')


    const query = `
      [out:json][timeout:15];

      (
        ${aroundQueries}
      );

      out body;
    `


    try {

      const peaks =
        await runOverpassQuery(
          query
        )


      allPeaks.push(
        ...peaks
      )

    }

    catch (error) {

      console.log(
        'Eroare analiză vizite:',
        error
      )

    }

  }


  const unique =
    new Map<
      number,
      OsmPeak
    >()


  for (
    const peak
    of allPeaks
  ) {

    unique.set(
      peak.id,
      peak
    )

  }


  return Array.from(
    unique.values()
  )

}


// =====================================================
// IDENTIFICĂ VÂRFURILE VIZITATE
// =====================================================

async function identifyVisitedPeaks(
  visits: Visit[]
): Promise<IdentifiedPeak[]> {

  if (
    visits.length ===
    0
  ) {

    return []

  }


  let nearbyPeaks:
    OsmPeak[] = []


  try {

    nearbyPeaks =
      await getPeaksNearVisits(
        visits
      )

  }

  catch (error) {

    console.log(
      'Eroare vârfuri vizitate:',
      error
    )

  }


  const results:
    IdentifiedPeak[] = []


  for (
    const visit
    of visits
  ) {

    const visitLatitude =
      Number(
        visit.latitude
      )


    const visitLongitude =
      Number(
        visit.longitude
      )


    if (
      !Number.isFinite(
        visitLatitude
      )
      ||
      !Number.isFinite(
        visitLongitude
      )
    ) {

      continue

    }


    const visitText =
      normalizeText(
        `${visit.place_name ?? ''} ` +
        `${visit.location_details ?? ''} ` +
        `${visit.description ?? ''}`
      )


    // =================================================
    // 1. ALTITUDINE DEJA SALVATĂ
    // =================================================

    const savedElevation =
      parseElevation(
        visit.peak_elevation
      )


    if (
      savedElevation !==
      null
      &&
      (
        visit.is_peak
        ||
        visitText.includes(
          'vf'
        )
      )
    ) {

      const extractedName =
        extractPeakNameFromVisit(
          visit
        )


      results.push({
        visitId:
          visit.id,

        name:
          extractedName
          ||
          visit.place_name
          ||
          'Vârf vizitat',

        elevation:
          savedElevation,

        distance:
          0,

        latitude:
          visitLatitude,

        longitude:
          visitLongitude
      })


      continue

    }


    // =================================================
    // 2. CĂUTĂM VÂRF APROPIAT
    // =================================================

    let bestPeak:
      IdentifiedPeak | null =
      null


    let bestScore =
      Number.POSITIVE_INFINITY


    for (
      const peak
      of nearbyPeaks
    ) {

      let elevation =
        parseElevation(
          peak.tags?.ele
        )


      const distance =
        calculateDistance(
          visitLatitude,
          visitLongitude,
          peak.lat,
          peak.lon
        )


      if (
        distance >
        VISIT_PEAK_SEARCH_RADIUS
      ) {

        continue

      }


      const peakName =
        getPeakName(
          peak
        )


      const normalizedPeakName =
        normalizePeakName(
          peakName
        )


      const visitPeakText =
        normalizePeakName(
          visitText
        )


      const nameMatches =
        normalizedPeakName.length >=
        2
        &&
        visitPeakText.includes(
          normalizedPeakName
        )


      if (
        distance >
        STRICT_PEAK_DISTANCE
        &&
        !nameMatches
      ) {

        continue

      }


      /*
        Dacă OSM nu are ele,
        putem cere DEM doar pentru
        un candidat relevant.
      */

      if (
        elevation ===
        null
      ) {

        elevation =
          await getOpenMeteoElevation(
            peak.lat,
            peak.lon
          )

      }


      if (
        elevation ===
        null
      ) {

        continue

      }


      const score =
        nameMatches
          ? distance - 10000
          : distance


      if (
        score <
        bestScore
      ) {

        bestScore =
          score


        bestPeak = {
          visitId:
            visit.id,

          name:
            peakName,

          elevation,

          distance,

          latitude:
            peak.lat,

          longitude:
            peak.lon
        }

      }

    }


    if (
      bestPeak
    ) {

      results.push(
        bestPeak
      )


      continue

    }


    // =================================================
    // 3. NUMELE VÂRFULUI APARE ÎN LOCAȚIE
    // =================================================

    const extractedPeakName =
      extractPeakNameFromVisit(
        visit
      )


    if (
      extractedPeakName
    ) {

      try {

        const externalPeak =
          await findPeakByName(
            extractedPeakName
          )


        if (
          externalPeak &&
          externalPeak.elevation !==
          null
        ) {

          const distance =
            calculateDistance(
              visitLatitude,
              visitLongitude,
              externalPeak.latitude,
              externalPeak.longitude
            )


          if (
            distance <=
            NAMED_PEAK_MAX_DISTANCE
          ) {

            results.push({
              visitId:
                visit.id,

              name:
                externalPeak.name,

              elevation:
                externalPeak.elevation,

              distance,

              latitude:
                externalPeak.latitude,

              longitude:
                externalPeak.longitude
            })

          }

        }

      }

      catch (error) {

        console.log(
          `Nu am putut verifica ${extractedPeakName}:`,
          error
        )

      }

    }

  }


  return results

}


// =====================================================
// VÂRFURI UNICE
// =====================================================

function getUniquePeaks(
  peaks: IdentifiedPeak[]
) {

  const unique =
    new Map<
      string,
      IdentifiedPeak
    >()


  for (
    const peak
    of peaks
  ) {

    const key =
      normalizePeakName(
        peak.name
      )


    const existing =
      unique.get(
        key
      )


    if (
      !existing
      ||
      peak.distance <
      existing.distance
    ) {

      unique.set(
        key,
        peak
      )

    }

  }


  return Array.from(
    unique.values()
  )

}


// =====================================================
// CHATBOT
// =====================================================

function ChatBot({
  visits
}: ChatBotProps) {

  // ===================================================
  // STATE
  // ===================================================

  const [
    open,
    setOpen
  ] =
    useState(
      false
    )


  const [
    input,
    setInput
  ] =
    useState(
      ''
    )


  const [
    loading,
    setLoading
  ] =
    useState(
      false
    )


  const [
    messages,
    setMessages
  ] =
    useState<ChatMessage[]>([
      {
        id:
          1,

        role:
          'bot',

        text:
`Salut! 👋 Sunt PeakQuest Bot.

Pot căuta informații despre vârfuri și pot analiza locurile tale vizitate.

Poți întreba:

• Ce altitudine are Vârful Negoiu?
• Ce altitudine are Moldoveanu?
• Care este cel mai înalt vârf pe care l-am vizitat?
• Ce vârfuri am vizitat?
• Câte vârfuri am vizitat?
• Am fost pe Vârful Omu?`
      }
    ])


  // ===================================================
  // CACHE VÂRFURI VIZITATE
  // ===================================================

  const visitedPeaksCacheRef =
    useRef<
      IdentifiedPeak[] | null
    >(
      null
    )


  const visitedPeaksPromiseRef =
    useRef<
      Promise<IdentifiedPeak[]> | null
    >(
      null
    )


  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null
    )


  // ===================================================
  // RESET CACHE CÂND SE SCHIMBĂ VIZITELE
  // ===================================================

  useEffect(() => {

    visitedPeaksCacheRef.current =
      null


    visitedPeaksPromiseRef.current =
      null

  }, [visits])


  // ===================================================
  // SCROLL AUTOMAT
  // ===================================================

  useEffect(() => {

    if (!open) {

      return

    }


    messagesEndRef.current
      ?.scrollIntoView({
        behavior:
          'smooth'
      })

  }, [
    messages,
    loading,
    open
  ])


  // ===================================================
  // ANALIZĂ VÂRFURI CU CACHE
  // ===================================================

  async function getVisitedPeaksCached() {

    if (
      visitedPeaksCacheRef.current
    ) {

      return (
        visitedPeaksCacheRef.current
      )

    }


    if (
      visitedPeaksPromiseRef.current
    ) {

      return await
        visitedPeaksPromiseRef.current

    }


    const promise =
      identifyVisitedPeaks(
        visits
      )


    visitedPeaksPromiseRef.current =
      promise


    try {

      const result =
        await promise


      if (
        result.length >
        0
      ) {

        visitedPeaksCacheRef.current =
          result

      }


      return result

    }

    finally {

      visitedPeaksPromiseRef.current =
        null

    }

  }


  // ===================================================
  // ALTITUDINE VÂRF EXTERN
  // ===================================================

  async function answerPeakElevation(
    question: string
  ) {

    const peakName =
      extractPeakName(
        question
      )


    if (!peakName) {

      return (
        'Spune-mi numele vârfului. De exemplu: „Ce altitudine are Vârful Negoiu?”'
      )

    }


    const peak =
      await findPeakByName(
        peakName
      )


    if (!peak) {

      return (
`❌ Nu am reușit să găsesc „${peakName}” în sursele externe.

Încearcă și forma simplă, de exemplu:
„Ce altitudine are Negoiu?”`
      )

    }


    if (
      peak.elevation ===
      null
    ) {

      return (
`🏔️ Am găsit ${peak.name}, dar nu am reușit să determin altitudinea.`
      )

    }


    if (
      peak.source ===
      'open-meteo-dem'
    ) {

      return (
`🏔️ ${peak.name}

Altitudine aproximativă: ${peak.elevation} m`
      )

    }


    return (
`🏔️ ${peak.name}

Altitudine: ${peak.elevation} m`
    )

  }


  // ===================================================
  // CEL MAI ÎNALT VÂRF VIZITAT
  // ===================================================

  async function answerHighestVisitedPeak() {

    if (
      visits.length ===
      0
    ) {

      return (
        'Nu ai încă nicio locație salvată în PeakQuest.'
      )

    }


    const identified =
      await getVisitedPeaksCached()


    if (
      identified.length ===
      0
    ) {

      return (
`Nu am reușit momentan să identific un vârf cu altitudine dintre locațiile tale.

Încearcă din nou peste câteva secunde.`
      )

    }


    const uniquePeaks =
      getUniquePeaks(
        identified
      )


    const highest =
      [...uniquePeaks]
        .sort(
          (a, b) =>
            b.elevation -
            a.elevation
        )[0]


    return (
`🏆 Cel mai înalt vârf pe care l-ai vizitat este:

🏔️ ${highest.name}

Altitudine: ${highest.elevation} m`
    )

  }


  // ===================================================
  // CE VÂRFURI AM VIZITAT
  // ===================================================

  async function answerVisitedPeaks() {

    if (
      visits.length ===
      0
    ) {

      return (
        'Nu ai încă nicio locație salvată.'
      )

    }


    const identified =
      await getVisitedPeaksCached()


    if (
      identified.length ===
      0
    ) {

      const possiblePeaks =
        visits.filter(
          (visit) => {

            const text =
              normalizeText(
                `${visit.place_name ?? ''} ` +
                `${visit.location_details ?? ''}`
              )


            return (
              visit.is_peak
              ||
              text.includes(
                'vf'
              )
            )

          }
        )


      if (
        possiblePeaks.length ===
        0
      ) {

        return (
          'Nu am identificat încă vârfuri printre locațiile tale.'
        )

      }


      const list =
        possiblePeaks
          .map(
            (visit, index) =>
              `${index + 1}. ${
                visit.place_name
                ||
                visit.location_details
                ||
                'Locație montană'
              }`
          )
          .join('\n')


      return (
`🏔️ Am găsit aceste locații asociate unor vârfuri:

${list}`
      )

    }


    const uniquePeaks =
      getUniquePeaks(
        identified
      )


    uniquePeaks.sort(
      (a, b) =>
        b.elevation -
        a.elevation
    )


    const list =
      uniquePeaks
        .map(
          (peak, index) =>
            `${index + 1}. ${peak.name} — ${peak.elevation} m`
        )
        .join('\n')


    return (
`🏔️ Vârfurile pe care le pot identifica dintre vizitele tale:

${list}`
    )

  }


  // ===================================================
  // CÂTE VÂRFURI AM VIZITAT
  // ===================================================

  async function answerVisitedPeakCount() {

    const identified =
      await getVisitedPeaksCached()


    if (
      identified.length >
      0
    ) {

      const uniquePeaks =
        getUniquePeaks(
          identified
        )


      const count =
        uniquePeaks.length


      if (
        count ===
        1
      ) {

        return (
          '🏔️ Ai vizitat 1 vârf identificat în PeakQuest.'
        )

      }


      return (
        `🏔️ Ai vizitat ${count} vârfuri identificate în PeakQuest.`
      )

    }


    const possiblePeaks =
      visits.filter(
        (visit) => {

          const text =
            normalizeText(
              `${visit.place_name ?? ''} ` +
              `${visit.location_details ?? ''}`
            )


          return (
            visit.is_peak
            ||
            text.includes(
              'vf'
            )
          )

        }
      )


    if (
      possiblePeaks.length ===
      0
    ) {

      return (
        'Nu am putut identifica încă vârfuri printre locațiile tale.'
      )

    }


    return (
      `🏔️ Am găsit ${possiblePeaks.length} locație${possiblePeaks.length === 1 ? '' : 'i'} asociată${possiblePeaks.length === 1 ? '' : 'e'} unor vârfuri.`
    )

  }


  // ===================================================
  // AM FOST PE VÂRF?
  // ===================================================

  async function answerHaveIVisited(
    question: string
  ) {

    const searchedName =
      extractPeakName(
        question
      )


    if (!searchedName) {

      return (
        'Spune-mi ce vârf vrei să verific. De exemplu: „Am fost pe Vârful Omu?”'
      )

    }


    const normalizedName =
      normalizePeakName(
        searchedName
      )


    // =================================================
    // CĂUTARE DIRECT ÎN SUPABASE
    // =================================================

    const directVisit =
      visits.find(
        (visit) => {

          const visitText =
            normalizeText(
              `${visit.place_name ?? ''} ` +
              `${visit.location_details ?? ''} ` +
              `${visit.description ?? ''}`
            )


          return visitText.includes(
            normalizedName
          )

        }
      )


    if (
      directVisit
    ) {

      return (
`✅ Da.

Am găsit această locație în vizitele tale:

📍 ${directVisit.place_name || directVisit.location_details || searchedName}`
      )

    }


    // =================================================
    // VÂRFURI IDENTIFICATE EXTERN
    // =================================================

    const identified =
      await getVisitedPeaksCached()


    const externalMatch =
      identified.find(
        (peak) => {

          const name =
            normalizePeakName(
              peak.name
            )


          return (
            name.includes(
              normalizedName
            )
            ||
            normalizedName.includes(
              name
            )
          )

        }
      )


    if (
      externalMatch
    ) {

      return (
`✅ Da.

După coordonatele fotografiei tale am identificat:

🏔️ ${externalMatch.name}

Altitudine: ${externalMatch.elevation} m`
      )

    }


    return (
      `❌ Nu am găsit „${searchedName}” printre locațiile tale vizitate.`
    )

  }


  // ===================================================
  // INTERPRETARE ÎNTREBARE
  // ===================================================

  async function generateAnswer(
    question: string
  ) {

    const normalized =
      normalizeText(
        question
      )


    // =================================================
    // CEL MAI ÎNALT
    // =================================================

    if (
      (
        normalized.includes(
          'cel mai inalt'
        )
        ||
        normalized.includes(
          'cea mai mare altitudine'
        )
        ||
        normalized.includes(
          'cea mai inalta'
        )
      )
      &&
      (
        normalized.includes(
          'vizitat'
        )
        ||
        normalized.includes(
          'am fost'
        )
        ||
        normalized.includes(
          'meu'
        )
        ||
        normalized.includes(
          'mele'
        )
        ||
        normalized.includes(
          'mine'
        )
      )
    ) {

      return await
        answerHighestVisitedPeak()

    }


    // =================================================
    // CÂTE VÂRFURI
    // =================================================

    if (
      (
        normalized.includes(
          'cate vf'
        )
        ||
        normalized.includes(
          'cati vf'
        )
        ||
        normalized.startsWith(
          'cate vf'
        )
      )
      &&
      (
        normalized.includes(
          'vizitat'
        )
        ||
        normalized.includes(
          'am fost'
        )
      )
    ) {

      return await
        answerVisitedPeakCount()

    }


    // =================================================
    // CE VÂRFURI
    // =================================================

    if (
      (
        normalized.includes(
          'ce vf'
        )
        ||
        normalized.includes(
          'care vf'
        )
      )
      &&
      (
        normalized.includes(
          'vizitat'
        )
        ||
        normalized.includes(
          'am fost'
        )
      )
    ) {

      return await
        answerVisitedPeaks()

    }


    // =================================================
    // AM FOST PE...
    // =================================================

    if (
      normalized.startsWith(
        'am fost'
      )
      ||
      normalized.startsWith(
        'am vizitat'
      )
      ||
      normalized.includes(
        'am fost pe'
      )
    ) {

      return await
        answerHaveIVisited(
          question
        )

    }


    // =================================================
    // ALTITUDINE EXTERNĂ
    // =================================================

    if (
      normalized.includes(
        'altitudine'
      )
      ||
      normalized.includes(
        'inaltime'
      )
      ||
      normalized.includes(
        'inalt'
      )
    ) {

      return await
        answerPeakElevation(
          question
        )

    }


    // =================================================
    // FALLBACK
    // =================================================

    return (
`Momentan pot răspunde la întrebări precum:

🏔️ Ce altitudine are Vârful Negoiu?

🏔️ Ce altitudine are Moldoveanu?

🏆 Care este cel mai înalt vârf pe care l-am vizitat?

📍 Ce vârfuri am vizitat?

🔢 Câte vârfuri am vizitat?

✅ Am fost pe Vârful Omu?`
    )

  }


  // ===================================================
  // TRIMITERE MESAJ
  // ===================================================

  async function sendMessage(
    event?: FormEvent
  ) {

    event
      ?.preventDefault()


    const question =
      input.trim()


    if (
      !question ||
      loading
    ) {

      return

    }


    const userMessage:
      ChatMessage = {
      id:
        Date.now(),

      role:
        'user',

      text:
        question
    }


    setMessages(
      (current) => [
        ...current,
        userMessage
      ]
    )


    setInput(
      ''
    )


    setLoading(
      true
    )


    try {

      const answer =
        await generateAnswer(
          question
        )


      setMessages(
        (current) => [
          ...current,

          {
            id:
              Date.now() + 1,

            role:
              'bot',

            text:
              answer
          }
        ]
      )

    }

    catch (error) {

      console.log(
        'PeakQuest Bot:',
        error
      )


      setMessages(
        (current) => [
          ...current,

          {
            id:
              Date.now() + 1,

            role:
              'bot',

            text:
`❌ Nu am reușit să obțin informațiile externe momentan.

Încearcă din nou peste câteva secunde.`
          }
        ]
      )

    }

    finally {

      setLoading(
        false
      )

    }

  }


  // ===================================================
  // UI
  // ===================================================

  return (

    <>

      {open && (

        <section
          className="peakquest-chat"
          aria-label="PeakQuest Bot"
        >

          {/* =================================================
              HEADER
          ================================================= */}

          <div className="chat-header">

            <div className="chat-header-left">

              <div className="chat-avatar">
                🏔️
              </div>


              <div>

                <div className="chat-title">
                  PeakQuest Bot
                </div>


                <div className="chat-subtitle">
                  Asistent montan
                </div>

              </div>

            </div>


            <button
              className="chat-close"
              type="button"
              title="Închide chat-ul"

              onClick={() =>
                setOpen(
                  false
                )
              }
            >

              ×

            </button>

          </div>


          {/* =================================================
              MESAJE
          ================================================= */}

          <div className="chat-messages">

            {messages.map(
              (message) => (

                <div
                  key={
                    message.id
                  }

                  className={
                    message.role ===
                    'user'
                      ? 'chat-message-row user'
                      : 'chat-message-row bot'
                  }
                >

                  <div
                    className={
                      message.role ===
                      'user'
                        ? 'chat-message user'
                        : 'chat-message bot'
                    }
                  >

                    {message.text}

                  </div>

                </div>

              )
            )}


            {/* =================================================
                LOADING
            ================================================= */}

            {loading && (

              <div
                className="chat-message-row bot"
              >

                <div
                  className="chat-message bot loading"
                >

                  <span />
                  <span />
                  <span />

                </div>

              </div>

            )}


            <div
              ref={
                messagesEndRef
              }
            />

          </div>


          {/* =================================================
              INPUT
          ================================================= */}

          <form
            className="chat-input-area"

            onSubmit={
              sendMessage
            }
          >

            <input
              type="text"

              value={
                input
              }

              disabled={
                loading
              }

              placeholder="Întreabă ceva..."

              onChange={(e) =>
                setInput(
                  e.target.value
                )
              }
            />


            <button
              type="submit"

              title="Trimite"

              disabled={
                loading ||
                !input.trim()
              }
            >

              ➤

            </button>

          </form>

        </section>

      )}


      {/* =================================================
          BUTON CHAT
      ================================================= */}

      <button
        className={
          open
            ? 'peakquest-chat-toggle open'
            : 'peakquest-chat-toggle'
        }

        type="button"

        title="PeakQuest Bot"

        onClick={() =>
          setOpen(
            !open
          )
        }
      >

        {open
          ? '×'
          : '💬'
        }

      </button>

    </>

  )

}


export default ChatBot