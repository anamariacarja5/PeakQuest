import {
  useEffect,
  useRef,
  useState
} from 'react'

import type {
  FormEvent
} from 'react'

import { supabase } from '../lib/supabase'

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

  visit_date?: string | null
  created_at?: string | null
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

    'is_in:mountains'?: string

    'is_in:mountain_range'?: string

    mountain_range?: string

    [key: string]:
      string | undefined
  }
}


type IdentifiedPeak = {
  visitId:
    string | number

  name: string

  elevation: number

  distance: number

  latitude: number
  longitude: number

  mountainRange?:
    string | null
}


type PeakFacts = {
  qid?: string

  name: string

  elevation:
    number | null

  latitude:
    number | null

  longitude:
    number | null

  mountainRanges:
    string[]

  locations:
    string[]

  country:
    string | null

  source:
    'wikidata'
    |
    'wikidata+dem'
    |
    'osm'
    |
    'osm+dem'
}


type WikidataSearchResult = {
  id: string

  label?: string

  description?: string

  aliases?: string[]
}


type WikidataTextValue = {
  language: string

  value: string
}


type WikidataEntity = {
  id: string

  labels?: Record<
    string,
    WikidataTextValue
  >

  descriptions?: Record<
    string,
    WikidataTextValue
  >

  aliases?: Record<
    string,
    WikidataTextValue[]
  >

  claims?: Record<
    string,
    any[]
  >
}


type MountainRangeEntity = {
  qid: string

  name: string

  entity:
    WikidataEntity
}


type AIIntent =
  'peak_elevation'
  |
  'peak_range'
  |
  'peak_location'
  |
  'peak_coordinates'
  |
  'highest_visited_peak'
  |
  'list_visited_peaks'
  |
  'count_visited_peaks'
  |
  'have_i_visited_peak'
  |
  'visited_peaks_in_range'
  |
  'highest_peak_in_range'
  |
  'highest_peak_in_romania'
  |
  'compare_peaks'
  |
  'general_mountain_question'
  |
  'unknown'


type ConversationIntent =
  AIIntent |
  null


type AIInterpretation = {
  intent:
    AIIntent

  peakName:
    string | null

  secondPeakName:
    string | null

  mountainRange:
    string | null

  minimumElevation:
    number | null

  wantsElevation:
    boolean

  wantsMountainRange:
    boolean

  wantsLocation:
    boolean

  wantsCoordinates:
    boolean

  usesUserVisits:
    boolean
}


// =====================================================
// CONFIG
// =====================================================

const WIKIDATA_API_URL =
  'https://www.wikidata.org/w/api.php'


const OPEN_METEO_ELEVATION_URL =
  'https://api.open-meteo.com/v1/elevation'


const OVERPASS_URLS = [

  'https://overpass-api.de/api/interpreter',

  'https://overpass.kumi.systems/api/interpreter'

]


const REQUEST_TIMEOUT =
  18000


const VISIT_PEAK_SEARCH_RADIUS =
  1500


const STRICT_PEAK_DISTANCE =
  500


/*
  Dacă în textul locației apare
  explicit numele vârfului:

  "Traseu ... Vârful Omu"

  permitem fotografiei să fie
  ceva mai departe de vârf.
*/

const NAMED_PEAK_MAX_DISTANCE =
  8000


// =====================================================
// CACHE
// =====================================================

const peakFactsCache =
  new Map<
    string,
    PeakFacts
  >()


const wikidataLabelCache =
  new Map<
    string,
    string
  >()


const mountainRangeCache =
  new Map<
    string,
    MountainRangeEntity
  >()


// =====================================================
// NORMALIZARE SIMPLĂ
// =====================================================

function plainNormalize(
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
      /[^a-z0-9\s-]/g,
      ' '
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim()

}


// =====================================================
// NORMALIZARE TEXT
// =====================================================

function normalizeText(
  text: string
) {

  return plainNormalize(
    text
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
      /\bvf\b/g,
      'vf'
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

    .replace(
      /^muntele\s+/,
      ''
    )

    .replace(
      /^munte\s+/,
      ''
    )

    .replace(
      /^mount\s+/,
      ''
    )

    .replace(
      /^peak\s+/,
      ''
    )

    .replace(
      /\s+peak$/,
      ''
    )

    /*
      Păstrăm numele propriu exact.

      IMPORTANT:
      Nu eliminăm automat terminația "l".
      Altfel nume reale precum "Pietrosul Rodnei"
      ar deveni greșit "Pietrosu Rodnei".
    */

    .replace(
      /\s+/g,
      ' '
    )

    .trim()

}


// =====================================================
// NORMALIZARE MASIV
// =====================================================

function normalizeRangeName(
  text: string
) {

  return plainNormalize(
    text
  )

    .replace(
      /^muntii\s+/,
      ''
    )

    .replace(
      /^muntele\s+/,
      ''
    )

    .replace(
      /^masivul\s+/,
      ''
    )

    .replace(
      /^masiv\s+/,
      ''
    )

    .replace(
      /\s+mountains$/,
      ''
    )

    .replace(
      /\s+mountain range$/,
      ''
    )

    .replace(
      /\s+massif$/,
      ''
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim()

}


// =====================================================
// AFIȘARE NUME VÂRF
// =====================================================

function humanizePeakName(
  name: string
) {

  const trimmed =
    name.trim()


  if (
    /^v[âa]rful\s+/i
      .test(
        trimmed
      )
  ) {

    return trimmed

  }


  if (
    /\speak$/i
      .test(
        trimmed
      )
  ) {

    return (
      `Vârful ${
        trimmed
          .replace(
            /\speak$/i,
            ''
          )
          .trim()
      }`
    )

  }


  return (
    `Vârful ${trimmed}`
  )

}


// =====================================================
// AFIȘARE NUME MASIV
// =====================================================

function humanizeRangeName(
  name: string
) {

  const trimmed =
    name.trim()


  if (
    /^munții\s+/i
      .test(trimmed)
    ||
    /^muntii\s+/i
      .test(trimmed)
  ) {

    return trimmed

  }


  if (
    /^masivul\s+/i
      .test(trimmed)
  ) {

    return trimmed

  }


  if (
    /\smountains$/i
      .test(trimmed)
  ) {

    return (
      `Munții ${
        trimmed
          .replace(
            /\smountains$/i,
            ''
          )
          .trim()
      }`
    )

  }


  if (
    /\smountain range$/i
      .test(trimmed)
  ) {

    return (
      `Munții ${
        trimmed
          .replace(
            /\smountain range$/i,
            ''
          )
          .trim()
      }`
    )

  }


  if (
    /\smassif$/i
      .test(trimmed)
  ) {

    return (
      `Masivul ${
        trimmed
          .replace(
            /\smassif$/i,
            ''
          )
          .trim()
      }`
    )

  }


  return trimmed

}


// =====================================================
// EXTRAGEM MASIVUL DIN ÎNTREBARE
// =====================================================

function extractRangeHint(
  question: string
) {

  const text =
    plainNormalize(
      question
    )


  const patterns = [

    /*
      Ce altitudine are Vf Greci
      din Munții Măcin?
    */

    /\b(?:din|in)\s+(?:muntii|masivul|masiv)\s+(.+?)(?:\s+(?:am|ai|este|sunt|se|pe care|vizitat|vizitate)\b|$)/,


    /*
      Ce vârfuri din Făgăraș
      am vizitat?
    */

    /\bdin\s+(.+?)\s+(?:am|ai|vizitat|vizitate)\b/

  ]


  for (
    const pattern
    of patterns
  ) {

    const match =
      text.match(
        pattern
      )


    if (
      match?.[1]
    ) {

      const value =
        normalizeRangeName(
          match[1]
        )


      if (value) {

        return value

      }

    }

  }


  return null

}


// =====================================================
// SCOATEM PARTEA CU MASIVUL DIN NUMELE VÂRFULUI
// =====================================================

function removeRangeHintFromText(
  text: string
) {

  return text

    .replace(
      /\b(?:din|in)\s+(?:muntii|masivul|masiv)\s+.+$/,
      ' '
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim()

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


  text =
    removeRangeHintFromText(
      text
    )


  const phrases = [

    /*
      Formulări foarte scurte / naturale:
      "Cât are Rarău?"
      "Câți metri are Negoiu?"
    */

    'cati metri are',

    'cati m are',

    'cat are',

    'ce altitudine are',

    'care este altitudinea',

    'care e altitudinea',

    'ce inaltime are',

    'care este inaltimea',

    'care e inaltimea',

    'cat de inalt este',

    'cat de inalt e',

    'cat de inalt',

    'in ce masiv se afla',

    'in ce masiv este',

    'in ce munti se afla',

    'in ce munti este',

    'din ce masiv face parte',

    'din ce masiv este',

    'din ce munti face parte',

    'ce masiv are',

    'ce coordonate are',

    'care sunt coordonatele',

    'unde se afla',

    'unde este',

    'unde e',

    'am fost pe',

    'am fost la',

    'am vizitat',

    'spune mi',

    'spunemi',

    'te rog',

    'muntele',

    'munte',

    'vf',

    'dar',

    'iar',

    'si'

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


  /*
    Curățăm și formulări în care cuvântul-cheie
    este pus după numele vârfului:

    "Pietrosul Rodnei înălțime"
    "Negoiu altitudine"

    dar și forme foarte scurte la început.
  */

  text =
    text
      .replace(
        /^(?:cat are|cati metri are|cati m are)\s+/,
        ' '
      )
      .replace(
        /\s+(?:altitudine|inaltime|inalt)$/,
        ' '
      )
      .replace(
        /^(?:altitudine|inaltime)\s+/,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()


  return normalizePeakName(
    text
  )

}


// =====================================================
// EXTRAGEM VÂRFUL DIN TEXTUL UNEI VIZITE
// =====================================================

function extractPeakNameFromVisit(
  visit: Visit
) {

  const text =
    `${visit.place_name ?? ''} ${visit.location_details ?? ''}`


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
    visit.is_peak
    &&
    visit.place_name
  ) {

    return visit.place_name

  }


  return null

}


// =====================================================
// ALTITUDINE
// =====================================================

function parseElevation(
  value: unknown
): number | null {

  if (
    value === undefined
    ||
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

      () =>
        controller.abort(),

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
// OPEN-METEO - ALTITUDINE DUPĂ COORDONATE
// =====================================================

async function getOpenMeteoElevation(

  latitude: number,

  longitude: number

): Promise<number | null> {

  try {

    const params =
      new URLSearchParams({

        latitude:
          String(latitude),

        longitude:
          String(longitude)

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


    const data =
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
      'Open-Meteo elevation:',
      error
    )


    return null

  }

}


// =====================================================
// WIKIDATA SEARCH
// =====================================================

async function wikidataSearch(

  search: string,

  language:
    'ro' | 'en'

): Promise<WikidataSearchResult[]> {

  const params =
    new URLSearchParams({

      action:
        'wbsearchentities',

      search:
        search,

      language:
        language,

      uselang:
        language,

      type:
        'item',

      limit:
        '15',

      format:
        'json',

      /*
        Permite apelarea API-ului
        direct din React/browser.
      */

      origin:
        '*'

    })


  const response =
    await fetchWithTimeout(

      `${WIKIDATA_API_URL}?${params.toString()}`

    )


  if (
    !response.ok
  ) {

    return []

  }


  const data =
    await response.json()


  return Array.isArray(
    data.search
  )
    ? data.search
    : []

}


// =====================================================
// WIKIDATA GET ENTITIES
// =====================================================

async function getWikidataEntities(
  ids: string[]
): Promise<WikidataEntity[]> {

  const uniqueIds =
    Array.from(
      new Set(ids)
    )
      .filter(Boolean)


  if (
    uniqueIds.length ===
    0
  ) {

    return []

  }


  const result:
    WikidataEntity[] = []


  const chunkSize =
    40


  for (
    let index = 0;

    index <
    uniqueIds.length;

    index +=
    chunkSize
  ) {

    const chunk =
      uniqueIds.slice(

        index,

        index +
        chunkSize

      )


    const params =
      new URLSearchParams({

        action:
          'wbgetentities',

        ids:
          chunk.join('|'),

        props:
          'labels|descriptions|aliases|claims',

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

        `${WIKIDATA_API_URL}?${params.toString()}`

      )


    if (
      !response.ok
    ) {

      continue

    }


    const data =
      await response.json()


    if (
      !data.entities
    ) {

      continue

    }


    for (
      const id
      of chunk
    ) {

      const entity =
        data.entities[id]


      if (
        entity
        &&
        !entity.missing
      ) {

        result.push(
          entity
        )

      }

    }

  }


  return result

}


// =====================================================
// LABEL PREFERAT
// =====================================================

function getPreferredEntityLabel(
  entity: WikidataEntity
) {

  return (

    entity.labels
      ?.ro
      ?.value

    ||

    entity.labels
      ?.en
      ?.value

    ||

    entity.id

  )

}


// =====================================================
// TOATE NUMELE / ALIASURILE
// =====================================================

function getEntityNames(
  entity: WikidataEntity
) {

  const names =
    new Set<string>()


  if (
    entity.labels
      ?.ro
      ?.value
  ) {

    names.add(
      entity.labels.ro.value
    )

  }


  if (
    entity.labels
      ?.en
      ?.value
  ) {

    names.add(
      entity.labels.en.value
    )

  }


  for (
    const alias
    of entity.aliases?.ro ??
    []
  ) {

    names.add(
      alias.value
    )

  }


  for (
    const alias
    of entity.aliases?.en ??
    []
  ) {

    names.add(
      alias.value
    )

  }


  return Array.from(
    names
  )

}


// =====================================================
// CLAIM DE TIP ITEM
// =====================================================

function getItemClaimIds(

  entity:
    WikidataEntity,

  propertyId:
    string

) {

  const claims =
    entity.claims
      ?.[propertyId]
    ??
    []


  return claims

    .map(
      (claim: any) =>

        claim
          ?.mainsnak
          ?.datavalue
          ?.value
          ?.id

    )

    .filter(
      (
        value: unknown
      ): value is string =>

        typeof value ===
        'string'
    )

}


// =====================================================
// CLAIM CANTITATIV
// =====================================================

function getQuantityClaim(

  entity:
    WikidataEntity,

  propertyId:
    string

) {

  const claims =
    entity.claims
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


    const parsed =
      parseElevation(
        amount
      )


    if (
      parsed !==
      null
    ) {

      return parsed

    }

  }


  return null

}


// =====================================================
// COORDONATE WIKIDATA
// =====================================================

function getCoordinateClaim(
  entity: WikidataEntity
) {

  const claims =
    entity.claims
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


  return null

}


// =====================================================
// REZOLVĂM QID -> NUME
// =====================================================

async function resolveWikidataLabels(
  ids: string[]
) {

  const unique =
    Array.from(
      new Set(ids)
    )
      .filter(Boolean)


  const missing =
    unique.filter(

      (id) =>
        !wikidataLabelCache
          .has(id)

    )


  if (
    missing.length >
    0
  ) {

    const entities =
      await getWikidataEntities(
        missing
      )


    for (
      const entity
      of entities
    ) {

      wikidataLabelCache.set(

        entity.id,

        getPreferredEntityLabel(
          entity
        )

      )

    }

  }


  const result =
    new Map<
      string,
      string
    >()


  for (
    const id
    of unique
  ) {

    const label =
      wikidataLabelCache
        .get(id)


    if (label) {

      result.set(
        id,
        label
      )

    }

  }


  return result

}


// =====================================================
// SCOR NUME
// =====================================================

function getNameMatchScore(

  candidateName:
    string,

  requestedName:
    string

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
    !candidate
    ||
    !requested
  ) {

    return 100

  }


  /*
    Negoiu === Negoiu
  */

  if (
    candidate ===
    requested
  ) {

    return 0

  }


  /*
    Negoiu Mic pentru Negoiu
    NU este match exact.
  */

  if (
    candidate.startsWith(
      `${requested} `
    )
  ) {

    return 2

  }


  if (
    candidate.includes(
      requested
    )
  ) {

    return 4

  }


  if (
    requested.includes(
      candidate
    )
  ) {

    return 6

  }


  const candidateWords =
    candidate
      .split(' ')


  const requestedWords =
    requested
      .split(' ')


  const commonWords =
    requestedWords
      .filter(

        (word) =>
          candidateWords
            .includes(
              word
            )

      )


  if (
    commonWords.length >
    0
  ) {

    return 20

  }


  return 100

}


// =====================================================
// SCOR MASIV
// =====================================================

function getRangeMatchScore(

  candidateRanges:
    string[],

  rangeHint:
    string | null

) {

  if (
    !rangeHint
  ) {

    return 0

  }


  const wanted =
    normalizeRangeName(
      rangeHint
    )


  for (
    const range
    of candidateRanges
  ) {

    const candidate =
      normalizeRangeName(
        range
      )


    if (
      candidate ===
      wanted
      ||
      candidate.includes(
        wanted
      )
      ||
      wanted.includes(
        candidate
      )
    ) {

      /*
        Bonus mare dacă masivul
        este cel cerut.

        Ex:
        Greci + Măcin.
      */

      return -700

    }

  }


  return 250

}


// =====================================================
// PARE A FI MUNTE?
// =====================================================

function looksLikeMountainText(
  text: string
) {

  const normalized =
    plainNormalize(
      text
    )


  return (

    normalized.includes(
      'mountain'
    )

    ||

    normalized.includes(
      'peak'
    )

    ||

    normalized.includes(
      'summit'
    )

    ||

    normalized.includes(
      'varf'
    )

    ||

    normalized.includes(
      'munte'
    )

  )

}


// =====================================================
// PARE A FI LOCALITATE?
// =====================================================

function looksLikeSettlementText(
  text: string
) {

  const normalized =
    plainNormalize(
      text
    )


  return (

    normalized.includes(
      'village'
    )

    ||

    normalized.includes(
      'commune'
    )

    ||

    normalized.includes(
      'city'
    )

    ||

    normalized.includes(
      'town'
    )

    ||

    normalized.includes(
      'municipality'
    )

    ||

    normalized.includes(
      'sat'
    )

    ||

    normalized.includes(
      'comuna'
    )

    ||

    normalized.includes(
      'oras'
    )

  )

}


// =====================================================
// WIKIDATA - GĂSIM VÂRFUL CORECT
// =====================================================

async function findWikidataPeakEntity(

  requestedName:
    string,

  rangeHint:
    string | null =
      null

): Promise<WikidataEntity | null> {

  const cleanName =
    normalizePeakName(
      requestedName
    )


  if (
    !cleanName
  ) {

    return null

  }


  /*
    Căutăm mai multe formulări.

    Important pentru:
    Negoiu
    Omu
    Greci
    Moldoveanu etc.
  */

  const variants =
    new Set<string>([

      cleanName,

      `Vârful ${cleanName}`,

      `${cleanName} peak`,

      `${cleanName} mountain`

    ])


  if (
    rangeHint
  ) {

    variants.add(
      `${cleanName} ${rangeHint}`
    )


    variants.add(
      `Vârful ${cleanName} ${rangeHint}`
    )

  }


  const searchResults:
    WikidataSearchResult[] =
    []


  for (
    const variant
    of variants
  ) {

    const [
      romanianResults,
      englishResults
    ] =
      await Promise.all([

        wikidataSearch(
          variant,
          'ro'
        ),

        wikidataSearch(
          variant,
          'en'
        )

      ])


    searchResults.push(
      ...romanianResults,
      ...englishResults
    )

  }


  const ids =
    Array.from(

      new Set(

        searchResults
          .map(
            (item) =>
              item.id
          )

      )

    )
      .slice(
        0,
        30
      )


  if (
    ids.length ===
    0
  ) {

    return null

  }


  const entities =
    await getWikidataEntities(
      ids
    )


  /*
    Avem nevoie și de numele
    tipurilor și masivelor.
  */

  const relatedIds =
    new Set<string>()


  for (
    const entity
    of entities
  ) {

    for (
      const id
      of getItemClaimIds(
        entity,
        'P31'
      )
    ) {

      relatedIds.add(id)

    }


    for (
      const id
      of getItemClaimIds(
        entity,
        'P4552'
      )
    ) {

      relatedIds.add(id)

    }


    for (
      const id
      of getItemClaimIds(
        entity,
        'P706'
      )
    ) {

      relatedIds.add(id)

    }

  }


  const labels =
    await resolveWikidataLabels(

      Array.from(
        relatedIds
      )

    )


  const ranked =
    entities

      .map(
        (entity) => {

          const names =
            getEntityNames(
              entity
            )


          /*
            Cel mai bun scor
            dintre label și aliases.
          */

          const nameScore =
            Math.min(

              ...names.map(
                (name) =>
                  getNameMatchScore(
                    name,
                    cleanName
                  )
              ),

              100

            )


          const description =
            [

              entity.descriptions
                ?.ro
                ?.value
              ??
              '',

              entity.descriptions
                ?.en
                ?.value
              ??
              ''

            ]
              .join(' ')


          const instanceLabels =
            getItemClaimIds(
              entity,
              'P31'
            )
              .map(
                (id) =>
                  labels.get(id)
                  ??
                  ''
              )


          const rangeIds =
            [

              ...getItemClaimIds(
                entity,
                'P4552'
              ),

              ...getItemClaimIds(
                entity,
                'P706'
              )

            ]


          const rangeLabels =
            rangeIds

              .map(
                (id) =>
                  labels.get(id)
                  ??
                  ''
              )

              .filter(Boolean)


          const hasElevation =

            getQuantityClaim(
              entity,
              'P2044'
            )
            !==
            null


          const hasCoordinates =

            getCoordinateClaim(
              entity
            )
            !==
            null


          const typeText =
            [

              description,

              ...instanceLabels

            ]
              .join(' ')


          const mountainLike =

            looksLikeMountainText(
              typeText
            )

            ||

            rangeLabels.length >
            0


          const settlementLike =
            looksLikeSettlementText(
              typeText
            )


          /*
            Scor mai mic =
            rezultat mai bun.
          */

          let score =
            nameScore *
            100


          /*
            Preferăm clar
            obiectele montane.
          */

          if (
            mountainLike
          ) {

            score -=
              550

          }


          /*
            Penalizăm sate,
            comune, orașe etc.
          */

          if (
            settlementLike
          ) {

            score +=
              900

          }


          if (
            hasElevation
          ) {

            score -=
              180

          }


          if (
            hasCoordinates
          ) {

            score -=
              80

          }


          if (
            rangeLabels.length >
            0
          ) {

            score -=
              120

          }


          score +=
            getRangeMatchScore(

              rangeLabels,

              rangeHint

            )


          return {

            entity,

            score,

            nameScore,

            mountainLike

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


  /*
    Protecție suplimentară:
    nu vrem un sat/localitate.
  */

  if (
    !best.mountainLike
    &&
    best.nameScore >
    0
  ) {

    return null

  }


  return best.entity

}


// =====================================================
// CONSTRUIM DATELE VÂRFULUI DIN WIKIDATA
// =====================================================

async function buildPeakFactsFromWikidata(
  entity: WikidataEntity
): Promise<PeakFacts> {

  const name =
    getPreferredEntityLabel(
      entity
    )


  /*
    P2044 = elevation above sea level
  */

  let elevation =
    getQuantityClaim(
      entity,
      'P2044'
    )


  /*
    P625 = coordinates
  */

  const coordinates =
    getCoordinateClaim(
      entity
    )


  /*
    P4552 = mountain range
  */

  const rangeIds =
    getItemClaimIds(
      entity,
      'P4552'
    )


  /*
    P706 poate apărea ca
    physical feature.
  */

  const physicalFeatureIds =
    getItemClaimIds(
      entity,
      'P706'
    )


  /*
    P131 = administrative location
  */

  const locationIds =
    getItemClaimIds(
      entity,
      'P131'
    )


  /*
    P17 = country
  */

  const countryIds =
    getItemClaimIds(
      entity,
      'P17'
    )


  const allRelated =
    [

      ...rangeIds,

      ...physicalFeatureIds,

      ...locationIds,

      ...countryIds

    ]


  const labels =
    await resolveWikidataLabels(
      allRelated
    )


  let mountainRanges =
    rangeIds

      .map(
        (id) =>
          labels.get(id)
      )

      .filter(
        (
          value
        ): value is string =>
          Boolean(value)
      )


  /*
    Dacă P4552 lipsește,
    încercăm P706.
  */

  if (
    mountainRanges.length ===
    0
  ) {

    mountainRanges =
      physicalFeatureIds

        .map(
          (id) =>
            labels.get(id)
        )

        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )

        .filter(
          (label) =>
            looksLikeMountainText(
              label
            )
        )

  }


  mountainRanges =
    mountainRanges
      .map(
        humanizeRangeName
      )


  const locations =
    locationIds

      .map(
        (id) =>
          labels.get(id)
      )

      .filter(
        (
          value
        ): value is string =>
          Boolean(value)
      )


  const country =

    countryIds.length >
    0

      ? labels.get(
          countryIds[0]
        )
        ??
        null

      : null


  let source:
    PeakFacts['source'] =
    'wikidata'


  /*
    Dacă Wikidata știe poziția,
    dar nu are altitudine,
    folosim DEM ca fallback.
  */

  if (
    elevation ===
    null
    &&
    coordinates
  ) {

    elevation =
      await getOpenMeteoElevation(

        coordinates.latitude,

        coordinates.longitude

      )


    if (
      elevation !==
      null
    ) {

      source =
        'wikidata+dem'

    }

  }


  return {

    qid:
      entity.id,

    name:
      humanizePeakName(
        name
      ),

    elevation,

    latitude:
      coordinates
        ?.latitude
      ??
      null,

    longitude:
      coordinates
        ?.longitude
      ??
      null,

    mountainRanges,

    locations,

    country,

    source

  }

}


// =====================================================
// OSM - NUME VÂRF
// =====================================================

function getOsmPeakName(
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
// OVERPASS CU FALLBACK
// =====================================================

async function runOverpassQuery(
  query: string
): Promise<OsmPeak[]> {

  let lastError:
    unknown =
    null


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
        data.elements
        ??
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
// OVERPASS - CĂUTARE EXACTĂ
// =====================================================

async function findPeakWithOverpassExact(
  requestedName: string
): Promise<PeakFacts | null> {

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
              getOsmPeakName(
                peak
              ),

            score:
              getNameMatchScore(

                getOsmPeakName(
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


    /*
      FOARTE IMPORTANT:

      Dacă cerem Negoiu,
      Negoiu Mic are scor 2.

      Acceptăm aici doar
      potrivirea exactă = 0.
    */

    if (
      !best
      ||
      best.score >
      0
    ) {

      return null

    }


    let elevation =
      parseElevation(
        best.peak.tags?.ele
      )


    let source:
      PeakFacts['source'] =
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
          'osm+dem'

      }

    }


    const range =

      best.peak.tags
        ?.['is_in:mountains']

      ||

      best.peak.tags
        ?.['is_in:mountain_range']

      ||

      best.peak.tags
        ?.mountain_range

      ||

      null


    return {

      name:
        humanizePeakName(
          best.name
        ),

      elevation,

      latitude:
        best.peak.lat,

      longitude:
        best.peak.lon,

      mountainRanges:

        range

          ? [
              humanizeRangeName(
                range
              )
            ]

          : [],

      locations:
        [],

      country:
        'România',

      source

    }

  }

  catch (error) {

    console.log(
      'Overpass exact peak:',
      error
    )


    return null

  }

}


// =====================================================
// CĂUTARE COMPLETĂ VÂRF
// =====================================================

async function findPeakFacts(

  requestedName:
    string,

  rangeHint:
    string | null =
      null

): Promise<PeakFacts | null> {

  const cleanName =
    normalizePeakName(
      requestedName
    )


  const cleanRange =
    rangeHint

      ? normalizeRangeName(
          rangeHint
        )

      : ''


  const cacheKey =
    `${cleanName}|${cleanRange}`


  const cached =
    peakFactsCache.get(
      cacheKey
    )


  if (cached) {

    return cached

  }


  // ===================================================
  // 1. WIKIDATA
  // ===================================================

  try {

    const entity =
      await findWikidataPeakEntity(

        cleanName,

        cleanRange ||
        null

      )


    if (
      entity
    ) {

      const facts =
        await buildPeakFactsFromWikidata(
          entity
        )


      peakFactsCache.set(
        cacheKey,
        facts
      )


      return facts

    }

  }

  catch (error) {

    console.log(
      'Wikidata peak search:',
      error
    )

  }


  // ===================================================
  // 2. OSM EXACT
  // ===================================================

  const osm =
    await findPeakWithOverpassExact(
      cleanName
    )


  if (
    osm
  ) {

    peakFactsCache.set(
      cacheKey,
      osm
    )


    return osm

  }


  return null

}


// =====================================================
// WIKIDATA - GĂSIM MASIVUL
// =====================================================

async function findMountainRangeEntity(
  requestedRange: string
): Promise<MountainRangeEntity | null> {

  const cleanRange =
    normalizeRangeName(
      requestedRange
    )


  if (
    !cleanRange
  ) {

    return null

  }


  const cached =
    mountainRangeCache.get(
      cleanRange
    )


  if (cached) {

    return cached

  }


  const variants = [

    cleanRange,

    `Munții ${cleanRange}`,

    `${cleanRange} Mountains`,

    `Masivul ${cleanRange}`

  ]


  const searchResults:
    WikidataSearchResult[] =
    []


  for (
    const variant
    of variants
  ) {

    const [
      romanian,
      english
    ] =
      await Promise.all([

        wikidataSearch(
          variant,
          'ro'
        ),

        wikidataSearch(
          variant,
          'en'
        )

      ])


    searchResults.push(
      ...romanian,
      ...english
    )

  }


  const ids =
    Array.from(

      new Set(

        searchResults
          .map(
            (item) =>
              item.id
          )

      )

    )
      .slice(
        0,
        25
      )


  if (
    ids.length ===
    0
  ) {

    return null

  }


  const entities =
    await getWikidataEntities(
      ids
    )


  const relatedIds =
    entities.flatMap(

      (entity) =>
        getItemClaimIds(
          entity,
          'P31'
        )

    )


  const labels =
    await resolveWikidataLabels(
      relatedIds
    )


  const ranked =
    entities

      .map(
        (entity) => {

          const names =
            getEntityNames(
              entity
            )


          const nameScore =
            Math.min(

              ...names.map(
                (name) => {

                  const candidate =
                    normalizeRangeName(
                      name
                    )


                  if (
                    candidate ===
                    cleanRange
                  ) {

                    return 0

                  }


                  if (
                    candidate.includes(
                      cleanRange
                    )
                    ||
                    cleanRange.includes(
                      candidate
                    )
                  ) {

                    return 2

                  }


                  return 20

                }
              ),

              100

            )


          const description =
            [

              entity.descriptions
                ?.ro
                ?.value
              ??
              '',

              entity.descriptions
                ?.en
                ?.value
              ??
              '',

              ...getItemClaimIds(
                entity,
                'P31'
              )
                .map(
                  (id) =>
                    labels.get(id)
                    ??
                    ''
                )

            ]
              .join(' ')


          const normalizedDescription =
            plainNormalize(
              description
            )


          const rangeLike =

            normalizedDescription
              .includes(
                'mountain range'
              )

            ||

            normalizedDescription
              .includes(
                'mountains'
              )

            ||

            normalizedDescription
              .includes(
                'masiv'
              )

            ||

            normalizedDescription
              .includes(
                'munti'
              )


          let score =
            nameScore *
            100


          if (
            rangeLike
          ) {

            score -=
              600

          }


          return {

            entity,

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


  const result = {

    qid:
      best.entity.id,

    name:
      humanizeRangeName(

        getPreferredEntityLabel(
          best.entity
        )

      ),

    entity:
      best.entity

  }


  mountainRangeCache.set(
    cleanRange,
    result
  )


  return result

}


// =====================================================
// CEL MAI ÎNALT PUNCT
// =====================================================

async function getHighestPointFromEntity(
  entity: WikidataEntity
): Promise<PeakFacts | null> {

  /*
    P610 = highest point
  */

  const highestIds =
    getItemClaimIds(
      entity,
      'P610'
    )


  if (
    highestIds.length ===
    0
  ) {

    return null

  }


  const peakEntities =
    await getWikidataEntities([
      highestIds[0]
    ])


  const peak =
    peakEntities[0]


  if (!peak) {

    return null

  }


  return await
    buildPeakFactsFromWikidata(
      peak
    )

}


// =====================================================
// VÂRFURI APROPIATE DE VIZITE
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


  const chunkSize =
    10


  const allPeaks:
    OsmPeak[] = []


  for (

    let index = 0;

    index <
    validVisits.length;

    index +=
    chunkSize

  ) {

    const chunk =
      validVisits.slice(

        index,

        index +
        chunkSize

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
        'Analiză vizite Overpass:',
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
    OsmPeak[] =
    []


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

        `${visit.place_name ?? ''} `

        +

        `${visit.location_details ?? ''} `

        +

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
          visitLongitude,

        mountainRange:
          visit.mountain_range
          ??
          null

      })


      continue

    }


    // =================================================
    // 2. DACĂ NUMELE APARE ÎN LOCAȚIE,
    //    FOLOSIM NUMELE.
    // =================================================

    const extractedPeakName =
      extractPeakNameFromVisit(
        visit
      )


    if (
      extractedPeakName
    ) {

      const external =
        await findPeakFacts(
          extractedPeakName
        )


      if (
        external
        &&
        external.elevation !==
        null
        &&
        external.latitude !==
        null
        &&
        external.longitude !==
        null
      ) {

        const distance =
          calculateDistance(

            visitLatitude,

            visitLongitude,

            external.latitude,

            external.longitude

          )


        if (
          distance <=
          NAMED_PEAK_MAX_DISTANCE
        ) {

          results.push({

            visitId:
              visit.id,

            name:
              external.name,

            elevation:
              external.elevation,

            distance,

            latitude:
              external.latitude,

            longitude:
              external.longitude,

            mountainRange:

              external
                .mountainRanges[0]

              ??

              visit.mountain_range

              ??

              null

          })


          continue

        }

      }

    }


    // =================================================
    // 3. FALLBACK CEL MAI APROPIAT OSM
    // =================================================

    let best:
      IdentifiedPeak | null =
      null


    let bestScore =
      Number
        .POSITIVE_INFINITY


    for (
      const peak
      of nearbyPeaks
    ) {

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
        getOsmPeakName(
          peak
        )


      const normalizedPeakName =
        normalizePeakName(
          peakName
        )


      const nameMatches =

        normalizedPeakName
          .length >=
        2

        &&

        visitText.includes(
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


      let elevation =
        parseElevation(
          peak.tags?.ele
        )


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

          ? distance -
            10000

          : distance


      if (
        score <
        bestScore
      ) {

        bestScore =
          score


        best = {

          visitId:
            visit.id,

          name:
            humanizePeakName(
              peakName
            ),

          elevation,

          distance,

          latitude:
            peak.lat,

          longitude:
            peak.lon,

          mountainRange:

            peak.tags
              ?.['is_in:mountains']

            ||

            peak.tags
              ?.['is_in:mountain_range']

            ||

            peak.tags
              ?.mountain_range

            ||

            null

        }

      }

    }


    if (best) {

      results.push(
        best
      )

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

Sunt asistentul tău montan. Pot răspunde atât despre istoricul tău PeakQuest, cât și la întrebări generale despre munți și drumeții.

De exemplu:

• În ce masiv se află Vârful Păpușa?
• Ce altitudine are Vârful Negoiu?
• Care este mai înalt: Negoiu sau Moldoveanu?
• Ce vârfuri din Făgăraș am vizitat?
• Care a fost prima mea drumeție?
• În ce lună am vizitat cele mai multe vârfuri?
• Ce echipament este util pentru o drumeție de o zi?
• Ce ar trebui să verific înainte să plec pe munte?

Poți formula întrebarea natural, nu trebuie să folosești o expresie exactă.`

      }

    ])


  // ===================================================
  // MEMORIA CONVERSAȚIEI
  // ===================================================

  const lastPeakNameRef =
    useRef<
      string | null
    >(
      null
    )


  const lastIntentRef =
    useRef<
      ConversationIntent
    >(
      null
    )


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
    useRef<
      HTMLDivElement | null
    >(
      null
    )


  // ===================================================
  // RESET CACHE LA MODIFICAREA VIZITELOR
  // ===================================================

  useEffect(() => {

    visitedPeaksCacheRef.current =
      null


    visitedPeaksPromiseRef.current =
      null

  }, [
    visits
  ])


  // ===================================================
  // SCROLL AUTOMAT
  // ===================================================

  useEffect(() => {

    if (!open) {

      return

    }


    messagesEndRef
      .current
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
  // VÂRFURI VIZITATE CU CACHE
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
  // REZOLVĂ NUMELE VÂRFULUI
  // ===================================================

  function resolvePeakName(

    question:
      string,

    forcedName?:
      string

  ) {

    const explicit =
      forcedName
      ||
      extractPeakName(
        question
      )


    if (
      explicit
    ) {

      return explicit

    }


    /*
      Pentru follow-up:

      "Și în ce masiv este?"
    */

    return (
      lastPeakNameRef.current
    )

  }


  // ===================================================
  // MEMORĂM VÂRFUL
  // ===================================================

  function rememberPeak(

    requestedName:
      string,

    intent:
      ConversationIntent

  ) {

    lastPeakNameRef.current =
      requestedName


    lastIntentRef.current =
      intent

  }


  // ===================================================
  // ALTITUDINE VÂRF
  // ===================================================

  async function answerPeakElevation(

    question:
      string,

    forcedName?:
      string,

    forcedRange?:
      string | null

  ) {

    const peakName =
      resolvePeakName(

        question,

        forcedName

      )


    if (
      !peakName
    ) {

      return (
        'Spune-mi numele vârfului. De exemplu: „Ce altitudine are Vârful Negoiu?”'
      )

    }


    const rangeHint =
      forcedRange
      ||
      extractRangeHint(
        question
      )


    const peak =
      await findPeakFacts(

        peakName,

        rangeHint

      )


    if (
      !peak
    ) {

      return (
        `❌ Nu am reușit să identific sigur vârful „${peakName}”.`
      )

    }


    rememberPeak(
      peakName,
      'peak_elevation'
    )


    if (
      peak.elevation ===
      null
    ) {

      return (
        `🏔️ Am găsit ${peak.name}, dar nu am găsit o altitudine sigură.`
      )

    }


    const approximate =

      peak.source
        .includes(
          'dem'
        )

        ? ' aproximativ'

        : ''


    const rangeText =

      peak.mountainRanges
        .length >
      0

        ? `\nMasiv: ${peak.mountainRanges.join(', ')}`

        : ''


    return (

`🏔️ ${peak.name}

Altitudine${approximate}: ${peak.elevation} m${rangeText}`

    )

  }


  // ===================================================
  // ÎN CE MASIV ESTE?
  // ===================================================

  async function answerPeakRange(

    question:
      string,

    forcedName?:
      string

  ) {

    const peakName =
      resolvePeakName(

        question,

        forcedName

      )


    if (
      !peakName
    ) {

      return (
        'Spune-mi numele vârfului. De exemplu: „În ce masiv se află Vârful Omu?”'
      )

    }


    const peak =
      await findPeakFacts(
        peakName
      )


    if (
      !peak
    ) {

      return (
        `❌ Nu am reușit să identific sigur vârful „${peakName}”.`
      )

    }


    rememberPeak(
      peakName,
      'peak_range'
    )


    if (
      peak.mountainRanges
        .length ===
      0
    ) {

      return (
        `🏔️ Am găsit ${peak.name}, dar sursa nu indică masivul montan.`
      )

    }


    return (

`🏔️ ${peak.name} se află în:

${peak.mountainRanges.join(', ')}`

    )

  }


  // ===================================================
  // COORDONATE
  // ===================================================

  async function answerPeakCoordinates(

    question:
      string,

    forcedName?:
      string

  ) {

    const peakName =
      resolvePeakName(

        question,

        forcedName

      )


    if (
      !peakName
    ) {

      return (
        'Spune-mi numele vârfului.'
      )

    }


    const peak =
      await findPeakFacts(
        peakName
      )


    if (
      !peak
    ) {

      return (
        `❌ Nu am reușit să identific sigur vârful „${peakName}”.`
      )

    }


    rememberPeak(
      peakName,
      'peak_coordinates'
    )


    if (
      peak.latitude ===
      null
      ||
      peak.longitude ===
      null
    ) {

      return (
        `🏔️ Am găsit ${peak.name}, dar nu am găsit coordonatele.`
      )

    }


    return (

`📍 ${peak.name}

Latitudine: ${peak.latitude.toFixed(6)}
Longitudine: ${peak.longitude.toFixed(6)}`

    )

  }


  // ===================================================
  // UNDE SE AFLĂ?
  // ===================================================

  async function answerPeakLocation(

    question:
      string,

    forcedName?:
      string

  ) {

    const peakName =
      resolvePeakName(

        question,

        forcedName

      )


    if (
      !peakName
    ) {

      return (
        'Spune-mi numele vârfului.'
      )

    }


    const peak =
      await findPeakFacts(
        peakName
      )


    if (
      !peak
    ) {

      return (
        `❌ Nu am reușit să identific sigur vârful „${peakName}”.`
      )

    }


    rememberPeak(
      peakName,
      'peak_location'
    )


    const lines:
      string[] =
      [

        `📍 ${peak.name}`

      ]


    if (
      peak.mountainRanges
        .length >
      0
    ) {

      lines.push(

        `Masiv: ${peak.mountainRanges.join(', ')}`

      )

    }


    if (
      peak.locations
        .length >
      0
    ) {

      lines.push(

        `Locație: ${peak.locations.join(', ')}`

      )

    }


    if (
      peak.country
    ) {

      lines.push(

        `Țară: ${peak.country}`

      )

    }


    if (
      peak.latitude !==
      null
      &&
      peak.longitude !==
      null
    ) {

      lines.push(

        `Coordonate: ${peak.latitude.toFixed(5)}, ${peak.longitude.toFixed(5)}`

      )

    }


    return lines.join(
      '\n'
    )

  }


  // ===================================================
  // CEL MAI ÎNALT VÂRF DINTR-UN MASIV
  // ===================================================

  async function answerHighestInRange(
    question: string,
    forcedRange?: string | null
  ) {

    const rangeHint =
      forcedRange
      ||
      extractRangeHint(
        question
      )


    if (
      !rangeHint
    ) {

      return (
        'Spune-mi masivul. De exemplu: „Care este cel mai înalt vârf din Munții Bucegi?”'
      )

    }


    const range =
      await findMountainRangeEntity(
        rangeHint
      )


    if (
      !range
    ) {

      return (
        `❌ Nu am reușit să identific masivul „${rangeHint}”.`
      )

    }


    const highest =
      await getHighestPointFromEntity(
        range.entity
      )


    if (
      !highest
    ) {

      return (
        `Am găsit ${range.name}, dar Wikidata nu indică un cel mai înalt punct pentru acest masiv.`
      )

    }


    const elevationText =

      highest.elevation !==
      null

        ? `${highest.elevation} m`

        : 'altitudine necunoscută'


    return (

`🏆 Cel mai înalt vârf din ${range.name} este:

${highest.name} — ${elevationText}`

    )

  }


  // ===================================================
  // CEL MAI ÎNALT VÂRF DIN ROMÂNIA
  // ===================================================

  async function answerHighestInRomania() {

    /*
      Q218 = România
    */

    const entities =
      await getWikidataEntities([
        'Q218'
      ])


    const romania =
      entities[0]


    if (
      !romania
    ) {

      return (
        'Nu am putut obține momentan datele despre România.'
      )

    }


    const highest =
      await getHighestPointFromEntity(
        romania
      )


    if (
      !highest
    ) {

      return (
        'Nu am găsit momentan cel mai înalt punct al României.'
      )

    }


    const elevationText =

      highest.elevation !==
      null

        ? `${highest.elevation} m`

        : 'altitudine necunoscută'


    return (

`🇷🇴 Cel mai înalt vârf din România este:

${highest.name} — ${elevationText}`

    )

  }


  // ===================================================
  // CE VÂRFURI AM VIZITAT?
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

      return (
        'Nu am reușit să identific încă vârfuri printre locațiile tale.'
      )

    }


    const unique =
      getUniquePeaks(
        identified
      )

        .sort(
          (a, b) =>
            b.elevation -
            a.elevation
        )


    const list =
      unique

        .map(

          (
            peak,
            index
          ) =>

            `${index + 1}. ${peak.name} — ${peak.elevation} m`

        )

        .join(
          '\n'
        )


    return (

`🏔️ Vârfurile identificate dintre vizitele tale:

${list}`

    )

  }


  // ===================================================
  // CÂTE VÂRFURI AM VIZITAT?
  // ===================================================

  async function answerVisitedPeakCount() {

    const identified =
      await getVisitedPeaksCached()


    const count =
      getUniquePeaks(
        identified
      )
        .length


    if (
      count ===
      0
    ) {

      return (
        'Nu am identificat încă niciun vârf dintre locațiile tale.'
      )

    }


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


  // ===================================================
  // CEL MAI ÎNALT VÂRF VIZITAT
  // ===================================================

  async function answerHighestVisitedPeak() {

    const identified =
      await getVisitedPeaksCached()


    if (
      identified.length ===
      0
    ) {

      return (
        'Nu am reușit să identific încă un vârf cu altitudine dintre locațiile tale.'
      )

    }


    const highest =
      getUniquePeaks(
        identified
      )

        .sort(
          (a, b) =>
            b.elevation -
            a.elevation
        )[0]


    return (

`🏆 Cel mai înalt vârf pe care l-ai vizitat este:

${highest.name}

Altitudine: ${highest.elevation} m`

    )

  }


  // ===================================================
  // AM FOST PE VÂRF?
  // ===================================================

  async function answerHaveIVisited(
    question: string,
    forcedName?: string | null
  ) {

    const searchedName =
      forcedName
      ||
      extractPeakName(
        question
      )


    if (
      !searchedName
    ) {

      return (
        'Spune-mi ce vârf vrei să verific.'
      )

    }


    const normalizedName =
      normalizePeakName(
        searchedName
      )


    // =================================================
    // CĂUTĂM DIRECT ÎN SUPABASE
    // =================================================

    const directVisit =
      visits.find(
        (visit) => {

          const visitText =
            normalizePeakName(

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
    // CĂUTĂM ÎN VÂRFURILE IDENTIFICATE
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

            name ===
            normalizedName

            ||

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

După coordonatele unei fotografii am identificat:

${externalMatch.name} — ${externalMatch.elevation} m`

      )

    }


    return (
      `❌ Nu am găsit „${searchedName}” printre locațiile tale vizitate.`
    )

  }


  // ===================================================
  // CE VÂRFURI DIN MASIV AM VIZITAT?
  // ===================================================

  async function answerVisitedPeaksInRange(
    question: string,
    forcedRange?: string | null,
    minimumElevation?: number | null
  ) {

    /*
      Dacă AI-ul a extras deja masivul,
      îl folosim direct. Altfel păstrăm
      fallback-ul vechi din întrebare.
    */

    let rangeHint =
      forcedRange
      ||
      extractRangeHint(
        question
      )


    /*
      Apoi varianta:
      "Ce vârfuri din Făgăraș am vizitat?"
    */

    if (
      !rangeHint
    ) {

      const text =
        plainNormalize(
          question
        )


      const match =
        text.match(
          /\bdin\s+(.+?)\s+am\s+vizitat\b/
        )


      if (
        match?.[1]
      ) {

        rangeHint =
          normalizeRangeName(
            match[1]
          )

      }

    }


    if (
      !rangeHint
    ) {

      return (
        'Spune-mi masivul. De exemplu: „Ce vârfuri din Făgăraș am vizitat?”'
      )

    }


    const peaks =
      getUniquePeaks(

        await getVisitedPeaksCached()

      )


    if (
      peaks.length ===
      0
    ) {

      return (
        'Nu am identificat încă vârfuri dintre locațiile tale.'
      )

    }


    const wanted =
      normalizeRangeName(
        rangeHint
      )


    /*
      Pentru fiecare vârf vizitat
      verificăm masivul în Wikidata.
    */

    const enriched =
      await Promise.all(

        peaks.map(

          async (
            peak
          ) => {

            const facts =
              await findPeakFacts(
                peak.name
              )


            return {

              peak,

              ranges:

                facts
                  ?.mountainRanges

                ??

                (
                  peak.mountainRange

                    ? [
                        peak.mountainRange
                      ]

                    : []
                )

            }

          }

        )

      )


    const matched =
      enriched.filter(
        (item) =>

          item.ranges.some(
            (range) => {

              const normalized =
                normalizeRangeName(
                  range
                )


              return (

                normalized ===
                wanted

                ||

                normalized.includes(
                  wanted
                )

                ||

                wanted.includes(
                  normalized
                )

              )

            }
          )

      )


    const filteredMatched =
      minimumElevation !==
      null
      &&
      minimumElevation !==
      undefined

        ? matched.filter(
            (item) =>
              item.peak.elevation >=
              minimumElevation
          )

        : matched


    if (
      filteredMatched.length ===
      0
    ) {

      return (
        `Nu am identificat vârfuri vizitate de tine în ${humanizeRangeName(rangeHint)}.`
      )

    }


    const list =
      filteredMatched

        .sort(
          (a, b) =>
            b.peak.elevation -
            a.peak.elevation
        )

        .map(

          (
            item,
            index
          ) =>

            `${index + 1}. ${item.peak.name} — ${item.peak.elevation} m`

        )

        .join(
          '\n'
        )


    return (

`🏔️ Vârfurile tale din ${humanizeRangeName(rangeHint)}${minimumElevation !== null && minimumElevation !== undefined ? ` peste ${minimumElevation} m` : ''}:

${list}`

    )

  }



  // ===================================================
  // CONTEXT PENTRU AI
  // ===================================================
  //
  // Trimitem doar informațiile utile pentru conversație.
  // NU trimitem user_id, email, image_path sau alte date
  // care nu sunt necesare pentru răspuns.
  // ===================================================

  function buildAIVisitsContext() {

    return visits.map(
      (visit) => ({

        place_name:
          visit.place_name
          ??
          null,

        location_details:
          visit.location_details
          ??
          null,

        description:
          visit.description
          ??
          null,

        is_peak:
          Boolean(
            visit.is_peak
          ),

        peak_elevation:
          visit.peak_elevation
          ??
          null,

        mountain_range:
          visit.mountain_range
          ??
          null,

        visit_date:
          visit.visit_date
          ??
          null,

        latitude:
          Number.isFinite(
            Number(
              visit.latitude
            )
          )
            ? Number(
                visit.latitude
              )
            : null,

        longitude:
          Number.isFinite(
            Number(
              visit.longitude
            )
          )
            ? Number(
                visit.longitude
              )
            : null

      })
    )

  }


  function buildAIConversationContext() {

    return messages

      /*
        Nu este nevoie să trimitem toată conversația.
        Ultimele mesaje sunt suficiente pentru follow-up-uri
        de tipul:
        "Dar acesta?"
        "Și în ce masiv este?"
      */

      .slice(
        -10
      )

      .map(
        (message) => ({

          role:
            message.role,

          text:
            message.text

        })
      )

  }


  // ===================================================
  // GEMINI - RĂSPUNS LIBER
  // ===================================================
  //
  // Această funcție este folosită pentru întrebările pe
  // care sistemul vechi nu le acoperă printr-o intenție
  // specializată.
  //
  // Edge Function-ul nou trebuie să accepte:
  //
  // mode: "answer"
  // question
  // visits
  // conversation
  //
  // și să întoarcă:
  //
  // { answer: "..." }
  //
  // Dacă Edge Function-ul este încă versiunea veche,
  // funcția întoarce null și botul continuă să funcționeze
  // prin sistemul existent.
  // ===================================================

  async function answerFreelyWithAI(
    question: string
  ): Promise<string | null> {

    try {

      const {
        data,
        error
      } =
        await supabase
          .functions
          .invoke(
            'peakquest-ai',
            {
              body: {

                mode:
                  'answer',

                question,

                visits:
                  buildAIVisitsContext(),

                conversation:
                  buildAIConversationContext(),

                lastPeakName:
                  lastPeakNameRef.current,

                lastIntent:
                  lastIntentRef.current

              }
            }
          )


      if (
        error
      ) {

        console.error(
          'PeakQuest AI direct answer:',
          error
        )


        return null

      }


      const answer =
        data
          ?.answer


      if (
        typeof answer !==
        'string'
        ||
        !answer.trim()
      ) {

        return null

      }


      return answer.trim()

    }

    catch (error) {

      console.error(
        'PeakQuest AI direct answer:',
        error
      )


      return null

    }

  }


  // ===================================================
  // GEMINI - INTERPRETAREA ÎNTREBĂRII
  // ===================================================

  async function interpretQuestionWithAI(
    question: string
  ): Promise<AIInterpretation | null> {

    try {

      const {
        data,
        error
      } =
        await supabase
          .functions
          .invoke(
            'peakquest-ai',
            {
              body: {

                question,

                lastPeakName:
                  lastPeakNameRef.current,

                lastIntent:
                  lastIntentRef.current

              }
            }
          )


      if (
        error
      ) {

        console.error(
          'PeakQuest AI Edge Function:',
          error
        )


        return null

      }


      const interpretation =
        data
          ?.interpretation


      if (
        !interpretation
        ||
        typeof interpretation.intent !==
        'string'
      ) {

        return null

      }


      console.log(
        'PeakQuest AI interpretation:',
        interpretation
      )


      return (
        interpretation as AIInterpretation
      )

    }

    catch (error) {

      console.error(
        'PeakQuest AI:',
        error
      )


      return null

    }

  }


  // ===================================================
  // RĂSPUNS COMBINAT DESPRE UN VÂRF
  // ===================================================

  async function answerPeakInfoFromAI(
    ai: AIInterpretation,
    question: string
  ) {

    /*
      Dacă Gemini a recunoscut intenția, dar nu a extras
      numele, încercăm parserul local înainte să folosim
      memoria conversației. Asta evită situații precum:

      "Cât are Rarău?" -> să rămână pe Moldoveanu.
    */

    const parsedPeakName =
      extractPeakName(
        question
      )


    const peakName =
      ai.peakName
      ||
      parsedPeakName
      ||
      lastPeakNameRef.current


    if (
      !peakName
    ) {

      return (
        'Spune-mi despre ce vârf este vorba.'
      )

    }


    const peak =
      await findPeakFacts(
        peakName,
        ai.mountainRange
      )


    if (
      !peak
    ) {

      return (
        `❌ Nu am reușit să identific sigur vârful „${peakName}”.`
      )

    }


    lastPeakNameRef.current =
      peakName


    lastIntentRef.current =
      ai.intent


    const lines:
      string[] =
      []


    lines.push(
      `🏔️ ${peak.name}`
    )


    if (
      ai.wantsElevation
    ) {

      if (
        peak.elevation !==
        null
      ) {

        const approximate =
          peak.source.includes(
            'dem'
          )

            ? ' aproximativă'

            : ''


        lines.push(
          `Altitudine${approximate}: ${peak.elevation} m`
        )

      }

      else {

        lines.push(
          'Altitudine: indisponibilă în sursele actuale.'
        )

      }

    }


    if (
      ai.wantsMountainRange
    ) {

      if (
        peak.mountainRanges.length >
        0
      ) {

        lines.push(
          `Masiv: ${peak.mountainRanges.join(', ')}`
        )

      }

      else {

        lines.push(
          'Masiv: indisponibil în sursele actuale.'
        )

      }

    }


    if (
      ai.wantsLocation
    ) {

      if (
        peak.locations.length >
        0
      ) {

        lines.push(
          `Locație: ${peak.locations.join(', ')}`
        )

      }


      if (
        peak.country
      ) {

        lines.push(
          `Țară: ${peak.country}`
        )

      }


      if (
        peak.locations.length ===
        0
        &&
        !peak.country
      ) {

        lines.push(
          'Locație: indisponibilă în sursele actuale.'
        )

      }

    }


    if (
      ai.wantsCoordinates
    ) {

      if (
        peak.latitude !==
        null
        &&
        peak.longitude !==
        null
      ) {

        lines.push(
          `Latitudine: ${peak.latitude.toFixed(6)}`
        )

        lines.push(
          `Longitudine: ${peak.longitude.toFixed(6)}`
        )

      }

      else {

        lines.push(
          'Coordonate: indisponibile în sursele actuale.'
        )

      }

    }


    /*
      Dacă AI-ul a clasificat întrebarea
      despre un vârf, dar nu a activat
      niciun flag, afișăm informațiile
      cele mai utile pe care le avem.
    */

    if (
      lines.length ===
      1
    ) {

      if (
        peak.elevation !==
        null
      ) {

        lines.push(
          `Altitudine: ${peak.elevation} m`
        )

      }


      if (
        peak.mountainRanges.length >
        0
      ) {

        lines.push(
          `Masiv: ${peak.mountainRanges.join(', ')}`
        )

      }

    }


    return lines.join(
      '\n\n'
    )

  }


  // ===================================================
  // COMPARĂ DOUĂ VÂRFURI
  // ===================================================

  async function answerComparePeaks(
    firstName: string | null,
    secondName: string | null
  ) {

    if (
      !firstName
      ||
      !secondName
    ) {

      return (
        'Spune-mi cele două vârfuri pe care vrei să le compar.'
      )

    }


    const [
      first,
      second
    ] =
      await Promise.all([

        findPeakFacts(
          firstName
        ),

        findPeakFacts(
          secondName
        )

      ])


    if (
      !first
      ||
      !second
    ) {

      return (
        '❌ Nu am reușit să identific sigur ambele vârfuri.'
      )

    }


    if (
      first.elevation ===
      null
      ||
      second.elevation ===
      null
    ) {

      return (
        'Am identificat vârfurile, dar nu am altitudini suficiente pentru comparație.'
      )

    }


    lastPeakNameRef.current =
      firstName


    lastIntentRef.current =
      'compare_peaks'


    const difference =
      Math.abs(
        first.elevation -
        second.elevation
      )


    if (
      first.elevation ===
      second.elevation
    ) {

      return (
`🏔️ ${first.name}: ${first.elevation} m

🏔️ ${second.name}: ${second.elevation} m

Au aceeași altitudine în datele disponibile.`
      )

    }


    const higher =
      first.elevation >
      second.elevation

        ? first

        : second


    const lower =
      first.elevation >
      second.elevation

        ? second

        : first


    return (
`🏔️ ${first.name}: ${first.elevation} m

🏔️ ${second.name}: ${second.elevation} m

⬆️ ${higher.name} este mai înalt decât ${lower.name} cu ${difference} m.`
    )

  }


  // ===================================================
  // FOLLOW-UP
  // ===================================================

  async function answerFollowUp(
    question: string
  ) {

    const explicitName =
      extractPeakName(
        question
      )


    const intent =
      lastIntentRef.current


    if (
      !intent
    ) {

      return null

    }


    if (
      !explicitName
      &&
      !lastPeakNameRef.current
    ) {

      return null

    }


    const peakName =

      explicitName

      ||

      lastPeakNameRef.current

      ||

      undefined


    /*
      Ex:

      Ce altitudine are Negoiu?
      Dar Moldoveanu?
    */

    if (
      intent ===
      'peak_elevation'
    ) {

      return await
        answerPeakElevation(

          question,

          peakName

        )

    }


    /*
      În ce masiv e Omu?
      Dar Moldoveanu?
    */

    if (
      intent ===
      'peak_range'
    ) {

      return await
        answerPeakRange(

          question,

          peakName

        )

    }


    if (
      intent ===
      'peak_location'
    ) {

      return await
        answerPeakLocation(

          question,

          peakName

        )

    }


    if (
      intent ===
      'peak_coordinates'
    ) {

      return await
        answerPeakCoordinates(

          question,

          peakName

        )

    }


    return null

  }


  // ===================================================
  // INTERPRETAREA ÎNTREBĂRII
  // ===================================================

  async function generateAnswerFallback(
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
    // CEL MAI ÎNALT DIN ROMÂNIA
    // =================================================

    if (

      normalized.includes(
        'cel mai inalt'
      )

      &&

      normalized.includes(
        'romania'
      )

    ) {

      return await
        answerHighestInRomania()

    }


    // =================================================
    // CEL MAI ÎNALT DINTR-UN MASIV
    // =================================================

    if (

      normalized.includes(
        'cel mai inalt'
      )

      &&

      (
        normalized.includes(
          'din muntii'
        )

        ||

        normalized.includes(
          'din masiv'
        )
      )

    ) {

      return await
        answerHighestInRange(
          question
        )

    }


    // =================================================
    // VÂRFURI VIZITATE DINTR-UN MASIV
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

        ||

        normalized.includes(
          'care dintre vf'
        )
      )

      &&

      normalized.includes(
        'vizitat'
      )

      &&

      normalized.includes(
        'din'
      )

    ) {

      return await
        answerVisitedPeaksInRange(
          question
        )

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
      )

      &&

      normalized.includes(
        'vizitat'
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

      normalized.includes(
        'vizitat'
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

    ) {

      return await
        answerHaveIVisited(
          question
        )

    }


    // =================================================
    // ÎN CE MASIV / MUNȚI?
    // =================================================

    if (

      normalized.includes(
        'in ce masiv'
      )

      ||

      normalized.includes(
        'din ce masiv'
      )

      ||

      normalized.includes(
        'ce masiv'
      )

      ||

      normalized.includes(
        'in ce munti'
      )

      ||

      normalized.includes(
        'din ce munti'
      )

    ) {

      return await
        answerPeakRange(
          question
        )

    }


    // =================================================
    // COORDONATE
    // =================================================

    if (

      normalized.includes(
        'coordonate'
      )

      ||

      normalized.includes(
        'latitudine si longitudine'
      )

    ) {

      return await
        answerPeakCoordinates(
          question
        )

    }


    // =================================================
    // UNDE SE AFLĂ?
    // =================================================

    if (

      normalized.startsWith(
        'unde'
      )

      ||

      normalized.includes(
        'unde se afla'
      )

      ||

      normalized.includes(
        'unde este'
      )

    ) {

      return await
        answerPeakLocation(
          question
        )

    }


    // =================================================
    // ALTITUDINE
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

      ||

      normalized.startsWith(
        'cat are '
      )

      ||

      normalized.startsWith(
        'cati metri are '
      )

      ||

      normalized.startsWith(
        'cati m are '
      )

    ) {

      return await
        answerPeakElevation(
          question
        )

    }


    // =================================================
    // FOLLOW-UP
    //
    // „Și în ce masiv este?”
    // „Dar Moldoveanu?”
    // =================================================

    if (

      normalized.startsWith(
        'si '
      )

      ||

      normalized.startsWith(
        'dar '
      )

      ||

      normalized.startsWith(
        'iar '
      )

      ||

      normalized
        .split(' ')
        .length <=
      3

    ) {

      const followUp =
        await answerFollowUp(
          question
        )


      if (
        followUp
      ) {

        return followUp

      }

    }


    // =================================================
    // FALLBACK
    // =================================================

    return (

`Momentan pot răspunde la întrebări precum:

🏔️ Ce altitudine are Vârful Negoiu?

🏔️ Ce altitudine are Vârful Greci din Munții Măcin?

🗻 În ce masiv se află Vârful Omu?

📍 Unde se află Moldoveanu?

🧭 Ce coordonate are Vârful Omu?

🏆 Care este cel mai înalt vârf din Munții Bucegi?

🇷🇴 Care este cel mai înalt vârf din România?

🥾 Ce vârfuri din Făgăraș am vizitat?

🏆 Care este cel mai înalt vârf pe care l-am vizitat?`

    )

  }



  // ===================================================
  // GENERARE RĂSPUNS - AI MAI ÎNTÂI, REGULI CA FALLBACK
  // ===================================================

  async function generateAnswer(
    question: string
  ) {

    /*
      Gemini NU furnizează datele geografice.
      El doar interpretează întrebarea.

      Datele reale rămân în:
      - Wikidata
      - OpenStreetMap
      - Open-Meteo
      - visits din Supabase
    */

    const ai =
      await interpretQuestionWithAI(
        question
      )


    if (
      ai
    ) {

      /*
        Păstrăm contextul pentru mesaje precum:
        "Și în ce masiv este?"
        "Dar Moldoveanu?"
      */

      if (
        ai.peakName
      ) {

        lastPeakNameRef.current =
          ai.peakName

      }


      if (
        ai.intent !==
        'unknown'
      ) {

        lastIntentRef.current =
          ai.intent

      }


      switch (
        ai.intent
      ) {


        // =============================================
        // INFORMAȚII DESPRE UN VÂRF
        // =============================================

        case 'peak_elevation':

        case 'peak_range':

        case 'peak_location':

        case 'peak_coordinates': {

          return await
            answerPeakInfoFromAI(
              ai,
              question
            )

        }


        // =============================================
        // CEL MAI ÎNALT VÂRF VIZITAT
        // =============================================

        case 'highest_visited_peak': {

          return await
            answerHighestVisitedPeak()

        }


        // =============================================
        // LISTA VÂRFURILOR VIZITATE
        // =============================================

        case 'list_visited_peaks': {

          return await
            answerVisitedPeaks()

        }


        // =============================================
        // NUMĂR VÂRFURI VIZITATE
        // =============================================

        case 'count_visited_peaks': {

          return await
            answerVisitedPeakCount()

        }


        // =============================================
        // AM FOST PE VÂRF?
        // =============================================

        case 'have_i_visited_peak': {

          return await
            answerHaveIVisited(
              question,
              ai.peakName
            )

        }


        // =============================================
        // VÂRFURI VIZITATE DINTR-UN MASIV
        // =============================================

        case 'visited_peaks_in_range': {

          return await
            answerVisitedPeaksInRange(

              question,

              ai.mountainRange,

              ai.minimumElevation

            )

        }


        // =============================================
        // CEL MAI ÎNALT DINTR-UN MASIV
        // =============================================

        case 'highest_peak_in_range': {

          return await
            answerHighestInRange(

              question,

              ai.mountainRange

            )

        }


        // =============================================
        // CEL MAI ÎNALT DIN ROMÂNIA
        // =============================================

        case 'highest_peak_in_romania': {

          return await
            answerHighestInRomania()

        }


        // =============================================
        // COMPARAȚIE
        // =============================================

        case 'compare_peaks': {

          return await
            answerComparePeaks(

              ai.peakName,

              ai.secondPeakName

            )

        }


        // =============================================
        // ÎNTREBARE GENERALĂ / NECUNOSCUTĂ
        //
        // Nu lăsăm Gemini să inventeze informații.
        // Încercăm sistemul nostru vechi.
        // =============================================

        case 'general_mountain_question':

        case 'unknown':

        default:
          break

      }

    }


    /*
      Dacă Gemini nu este disponibil,
      se termină Free Tier-ul,
      Edge Function-ul are o problemă
      sau AI-ul nu recunoaște întrebarea,
      chatbotul rămâne funcțional cu
      sistemul vechi bazat pe reguli.
    */

    /*
      Chiar dacă interpretarea pe intenții nu a funcționat,
      încercăm încă o dată varianta conversațională.
      Asta permite Edge Function-ului nou să răspundă la
      întrebări care nu există în lista AIIntent.
    */

    const directAnswer =
      await answerFreelyWithAI(
        question
      )


    if (
      directAnswer
    ) {

      return directAnswer

    }


    /*
      Ultima plasă de siguranță:
      vechiul motor bazat pe reguli.
    */

    return await
      generateAnswerFallback(
        question
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
      !question
      ||
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
              Date.now() +
              1,

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
              Date.now() +
              1,

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

                  <div className="chat-message-row bot">


                    <div className="chat-message bot loading">

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