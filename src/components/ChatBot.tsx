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


type PeakLookupResult = {
  name: string

  elevation:
    number | null

  latitude: number
  longitude: number
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

const OVERPASS_URLS = [

  'https://overpass-api.de/api/interpreter',

  'https://overpass.kumi.systems/api/interpreter'

]


const NOMINATIM_SEARCH_URL =
  'https://nominatim.openstreetmap.org/search'


/*
  La vizitele utilizatorului căutăm
  vârfuri într-o rază de 1.5 km.
*/

const VISIT_PEAK_SEARCH_RADIUS =
  1500


/*
  Dacă fotografia este la maximum
  500 m de vârf, acceptăm automat
  că este foarte aproape.
*/

const STRICT_PEAK_DISTANCE =
  500


/*
  Dacă numele vârfului apare explicit
  în locația salvată, permitem o
  distanță mai mare.

  Exemplu:
  "Traseu ... Vârful Omu ..."
*/

const NAMED_PEAK_MAX_DISTANCE =
  8000


/*
  Când Nominatim găsește coordonatele
  unui vârf, căutăm în jurul lor
  pentru a găsi obiectul natural=peak.
*/

const PEAK_NAME_COORDINATE_RADIUS =
  3000


const REQUEST_TIMEOUT =
  18000


// =====================================================
// CACHE GLOBAL PENTRU VÂRFURI CĂUTATE DUPĂ NUME
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


// =====================================================
// FETCH CU TIMEOUT
// =====================================================

async function fetchWithTimeout(

  url: string,

  options:
    RequestInit = {},

  timeout =
    REQUEST_TIMEOUT

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
// OVERPASS CU FALLBACK
// =====================================================

async function runOverpassQuery(
  query: string
): Promise<OsmPeak[]> {

  let lastError:
    unknown = null


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
        `Overpass indisponibil: ${overpassUrl}`,
        error
      )

    }

  }


  throw (
    lastError
    ??
    new Error(
      'Serviciile Overpass sunt indisponibile.'
    )
  )

}


// =====================================================
// NUME VÂRF
// =====================================================

function getPeakName(
  peak: OsmPeak
) {

  return (

    peak.tags
      ?.['name:ro']

    ||

    peak.tags
      ?.name

    ||

    peak.tags
      ?.alt_name

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
// EXTRAGEM NUMELE DIN ÎNTREBARE
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
// EXTRAGEM VÂRFUL DIN TEXTUL UNEI VIZITE
// =====================================================

function extractPeakNameFromVisit(
  visit: Visit
) {

  const text =
    `${visit.place_name ?? ''} ${visit.location_details ?? ''}`


  /*
    Exemplu:

    Traseu turistic Poiana Coștilei -
    Vârful Omu (Banda Galbena), Bușteni...
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
      result.length >= 2
    ) {

      return result

    }

  }


  /*
    Dacă vizita era deja marcată
    explicit ca vârf, folosim
    place_name.
  */

  if (
    visit.is_peak &&
    visit.place_name
  ) {

    return visit.place_name

  }


  return null

}


// =====================================================
// SCOR NUME VÂRF
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
    candidate ===
    requested
  ) {

    return 0

  }


  if (
    candidate.includes(
      requested
    )
  ) {

    return 1

  }


  if (
    requested.includes(
      candidate
    )
  ) {

    return 2

  }


  const requestedWords =
    requested.split(' ')


  const candidateWords =
    candidate.split(' ')


  const commonWords =
    requestedWords.filter(
      (word) =>
        candidateWords.includes(
          word
        )
    )


  if (
    commonWords.length > 0
  ) {

    return 5

  }


  return 100

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


    const url =
      `${NOMINATIM_SEARCH_URL}?${params.toString()}`


    const response =
      await fetchWithTimeout(
        url
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
      results.length === 0
    ) {

      return null

    }


    const ranked =
      [...results]
        .map(
          (item) => {

            const candidateName =

              item.name

              ||

              item.namedetails
                ?.name

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


            /*
              natural=peak primește
              prioritate foarte mare.
            */

            if (
              item.type ===
              'peak'
            ) {

              score -=
                20

            }


            if (
              item.category ===
              'natural'
            ) {

              score -=
                10

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

      longitude

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
// OVERPASS - CĂUTARE ÎN JURUL UNOR COORDONATE
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
      peaks.length === 0
    ) {

      return null

    }


    const requested =
      normalizePeakName(
        requestedName
      )


    const ranked =
      peaks

        .filter(
          (peak) =>

            typeof peak.lat ===
              'number'

            &&

            typeof peak.lon ===
              'number'

        )

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
                requested
              )


            /*
              Numele are prioritate.

              Distanța este folosită
              doar pentru departajare.
            */

            const score =
              (
                nameScore *
                100000
              )
              +
              distance


            return {

              peak,

              name,

              distance,

              nameScore,

              score

            }

          }
        )

        .sort(
          (a, b) =>
            a.score -
            b.score
        )


    if (
      ranked.length === 0
    ) {

      return null

    }


    /*
      Preferăm un nume care chiar
      seamănă cu cel căutat.
    */

    const matchingPeak =
      ranked.find(
        (candidate) =>
          candidate.nameScore <=
          5
      )


    const best =
      matchingPeak
      ??
      ranked[0]


    /*
      Dacă numele nu seamănă deloc,
      acceptăm doar dacă Nominatim
      ne-a dus practic exact pe vârf.
    */

    if (
      best.nameScore >= 100
      &&
      best.distance > 800
    ) {

      return null

    }


    return {

      name:
        best.name,

      elevation:
        parseElevation(
          best.peak
            .tags
            ?.ele
        ),

      latitude:
        best.peak.lat,

      longitude:
        best.peak.lon

    }

  }

  catch (error) {

    console.log(
      'Peak around coordinates error:',
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


    /*
      Bounding box aproximativ România:

      sud, vest, nord, est
    */

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
      peaks.length === 0
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


            return {

              peak,

              name,

              score:
                getNameMatchScore(
                  name,
                  cleanName
                )

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


    return {

      name:
        best.name,

      elevation:
        parseElevation(
          best.peak
            .tags
            ?.ele
        ),

      latitude:
        best.peak.lat,

      longitude:
        best.peak.lon

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
// CĂUTARE COMPLETĂ A UNUI VÂRF DUPĂ NUME
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
  // 1. NOMINATIM
  // ===================================================

  const nominatimResult =
    await findPeakWithNominatim(
      cleanName
    )


  if (
    nominatimResult
  ) {

    /*
      Dacă Nominatim are deja
      altitudine, suntem gata.
    */

    if (
      nominatimResult
        .elevation !==
      null
    ) {

      peakLookupCache.set(
        cleanName,
        nominatimResult
      )


      return nominatimResult

    }


    /*
      Dacă nu are altitudine,
      folosim coordonatele găsite
      și căutăm natural=peak în jur.
    */

    const nearbyResult =
      await findPeakNearCoordinates(

        nominatimResult.latitude,

        nominatimResult.longitude,

        cleanName

      )


    if (
      nearbyResult
    ) {

      const finalResult = {

        name:
          nearbyResult.name,

        elevation:
          nearbyResult.elevation,

        latitude:
          nearbyResult.latitude,

        longitude:
          nearbyResult.longitude

      }


      peakLookupCache.set(
        cleanName,
        finalResult
      )


      return finalResult

    }


    /*
      Păstrăm totuși rezultatul
      Nominatim dacă l-am găsit.
    */

    peakLookupCache.set(
      cleanName,
      nominatimResult
    )


    return nominatimResult

  }


  // ===================================================
  // 2. FALLBACK OVERPASS DUPĂ NUME
  // ===================================================

  const overpassResult =
    await findPeakByNameOverpass(
      cleanName
    )


  if (
    overpassResult
  ) {

    peakLookupCache.set(
      cleanName,
      overpassResult
    )


    return overpassResult

  }


  /*
    IMPORTANT:

    Nu salvăm "null" în cache.

    Dacă serviciile externe au avut
    o problemă temporară, următoarea
    întrebare va putea încerca din nou.
  */

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
    validVisits.length === 0
  ) {

    return []

  }


  /*
    Nu trimitem un query foarte mare.
  */

  const CHUNK_SIZE =
    10


  const allPeaks:
    OsmPeak[] = []


  for (

    let index = 0;

    index <
    validVisits.length;

    index +=
    CHUNK_SIZE

  ) {

    const chunk =
      validVisits.slice(

        index,

        index +
        CHUNK_SIZE

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
        'Nu am putut analiza acest grup de vizite:',
        error
      )

    }

  }


  // ===================================================
  // ELIMINĂM DUPLICATE
  // ===================================================

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
    visits.length === 0
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
      'Eroare căutare vârfuri vizitate:',
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

        `${visit.place_name ?? ''} `

        +

        `${visit.location_details ?? ''} `

        +

        `${visit.description ?? ''}`

      )


    // =================================================
    // 1. DATE DEJA SALVATE
    // =================================================

    const savedElevation =
      parseElevation(
        visit.peak_elevation
      )


    if (
      savedElevation !== null
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
    // 2. CĂUTARE DUPĂ COORDONATE
    // =================================================

    let bestPeak:
      IdentifiedPeak | null = null


    let bestScore =
      Number.POSITIVE_INFINITY


    for (
      const peak
      of nearbyPeaks
    ) {

      const elevation =
        parseElevation(
          peak.tags?.ele
        )


      if (
        elevation === null
      ) {

        continue

      }


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

        normalizedPeakName.length >= 2

        &&

        (
          visitPeakText.includes(
            normalizedPeakName
          )

          ||

          normalizedPeakName.includes(
            visitPeakText
          )
        )


      if (
        distance >
        STRICT_PEAK_DISTANCE
        &&
        !nameMatches
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
    // 3. FALLBACK DUPĂ NUMELE DIN LOCAȚIE
    //
    // Exemplu:
    // "Traseu ... Vârful Omu ..."
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
          externalPeak
          &&
          externalPeak.elevation !== null
        ) {

          const distance =
            calculateDistance(

              visitLatitude,

              visitLongitude,

              externalPeak.latitude,

              externalPeak.longitude

            )


          /*
            Pentru că numele vârfului
            apare explicit în locația
            utilizatorului, putem accepta
            o distanță mai mare.
          */

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
// ELIMINĂM DUPLICATELE DE VÂRF
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


    /*
      Dacă există două vizite la
      același vârf, păstrăm informația
      cu distanța cea mai mică.
    */

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
• Care este cel mai înalt vârf pe care l-am vizitat?
• Ce vârfuri am vizitat?
• Câte vârfuri am vizitat?
• Am fost pe Vârful Omu?`

      }

    ])


  // ===================================================
  // CACHE PENTRU VÂRFURILE VIZITATE
  // ===================================================

  const visitedPeaksCacheRef =
    useRef<
      IdentifiedPeak[] | null
    >(
      null
    )


  /*
    Dacă o analiză este deja în curs,
    celelalte întrebări o pot refolosi.
  */

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
  // OBȚINEM VÂRFURILE VIZITATE CU CACHE
  // ===================================================

  async function getVisitedPeaksCached() {

    /*
      Dacă am calculat deja rezultatul,
      îl folosim instant.
    */

    if (
      visitedPeaksCacheRef.current
    ) {

      return (
        visitedPeaksCacheRef.current
      )

    }


    /*
      Dacă analiza este deja în curs,
      așteptăm aceeași promisiune.
    */

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


      /*
        Cache-uim rezultatul doar dacă
        am găsit ceva.

        Dacă serviciile externe au avut
        o problemă și rezultatul este gol,
        permitem o nouă încercare ulterior.
      */

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
`Nu am reușit să găsesc vârful „${peakName}” în sursele externe disponibile.

Poți încerca din nou peste câteva secunde.`
      )

    }


    if (
      peak.elevation ===
      null
    ) {

      return (
`🏔️ Am găsit ${peak.name}, dar sursa externă nu mi-a oferit altitudinea acestui vârf.`
      )

    }


    return (
`🏔️ ${peak.name}

Altitudine: ${peak.elevation} m.`
    )

  }


  // ===================================================
  // CEL MAI ÎNALT VÂRF VIZITAT
  // ===================================================

  async function answerHighestVisitedPeak() {

    if (
      visits.length === 0
    ) {

      return (
        'Nu ai încă nicio locație salvată în PeakQuest.'
      )

    }


    const identified =
      await getVisitedPeaksCached()


    if (
      identified.length === 0
    ) {

      return (
`Nu am reușit momentan să identific un vârf cu altitudine dintre locațiile tale.

Poți încerca din nou peste câteva secunde.`
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
      visits.length === 0
    ) {

      return (
        'Nu ai încă nicio locație salvată.'
      )

    }


    const identified =
      await getVisitedPeaksCached()


    if (
      identified.length === 0
    ) {

      /*
        Fallback vizual:
        arătăm locațiile unde textul
        conține "vârf".
      */

      const possiblePeaks =
        visits.filter(
          (visit) => {

            const text =
              normalizeText(

                `${visit.place_name ?? ''} `

                +

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
        possiblePeaks.length === 0
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
        count === 1
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

              `${visit.place_name ?? ''} `

              +

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
      possiblePeaks.length === 0
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
    // 1. CĂUTĂM DIRECT ÎN SUPABASE
    // =================================================

    const directVisit =
      visits.find(
        (visit) => {

          const visitText =
            normalizeText(

              `${visit.place_name ?? ''} `

              +

              `${visit.location_details ?? ''} `

              +

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
    // 2. VERIFICĂM VÂRFURILE IDENTIFICATE
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
  // INTERPRETAREA ÎNTREBĂRII
  // ===================================================

  async function generateAnswer(
    question: string
  ) {

    const normalized =
      normalizeText(
        question
      )


    // =================================================
    // CEL MAI ÎNALT VÂRF VIZITAT
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
    // CÂTE VÂRFURI AM VIZITAT
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
    // CE VÂRFURI AM VIZITAT
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
    // ALTITUDINE VÂRF EXTERN
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

      {
        open
        &&
        (

          <section
            className="peakquest-chat"
            aria-label="PeakQuest Bot"
          >


            {/* ===========================================
                HEADER
            =========================================== */}

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


            {/* ===========================================
                MESAJE
            =========================================== */}

            <div className="chat-messages">


              {
                messages.map(
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

                        {
                          message.text
                        }

                      </div>


                    </div>

                  )
                )
              }


              {/* =========================================
                  LOADING
              ========================================= */}

              {
                loading
                &&
                (

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

                )
              }


              <div
                ref={
                  messagesEndRef
                }
              />


            </div>


            {/* ===========================================
                INPUT
            =========================================== */}

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
                  loading
                  ||
                  !input.trim()
                }

              >

                ➤

              </button>


            </form>


          </section>

        )
      }


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

        {
          open
            ? '×'
            : '💬'
        }

      </button>


    </>

  )

}


export default ChatBot