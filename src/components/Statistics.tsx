import {
  useEffect,
  useMemo,
  useState
} from 'react'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { supabase } from '../lib/supabase'

import './Statistics.css'


// =====================================================
// TIPURI
// =====================================================

type Visit = {
  id: string | number

  latitude?: number | null
  longitude?: number | null

  place_name?: string | null
  location_details?: string | null
  description?: string | null

  is_peak?: boolean | null

  peak_elevation?: number | null
  mountain_range?: string | null

  visit_date?: string | null
  created_at?: string | null
}


type StatisticsProps = {
  visits: Visit[]
}


type PeakVisit = {
  id: string | number

  name: string

  elevation: number | null

  mountainRange: string | null

  date: Date | null
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

  aliases?: Record<
    string,
    WikidataTextValue[]
  >

  descriptions?: Record<
    string,
    WikidataTextValue
  >

  claims?: Record<
    string,
    any[]
  >
}


type PeakMetadata = {
  elevation: number | null
  mountainRange: string | null
}


// =====================================================
// CONFIG
// =====================================================

const WIKIDATA_API_URL =
  'https://www.wikidata.org/w/api.php'


const MONTH_NAMES = [
  'Ian',
  'Feb',
  'Mar',
  'Apr',
  'Mai',
  'Iun',
  'Iul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]


const peakMetadataCache =
  new Map<
    string,
    PeakMetadata
  >()


// =====================================================
// NORMALIZARE
// =====================================================

function normalizeText(
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
// NORMALIZARE NUME VÂRF
// =====================================================

function normalizePeakName(
  value: string
) {

  return normalizeText(
    value
  )

    .replace(
      /^varful\s+/,
      ''
    )

    .replace(
      /^vf\s+/,
      ''
    )

    .replace(
      /^vf\.\s*/,
      ''
    )

    .trim()

}


// =====================================================
// DATA
// =====================================================

function parseDate(
  value?: string | null
) {

  if (!value) {

    return null

  }


  const date =
    new Date(
      value
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null

  }


  return date

}


function getVisitDate(
  visit: Visit
) {

  return (
    parseDate(
      visit.visit_date
    )
    ||
    parseDate(
      visit.created_at
    )
  )

}


// =====================================================
// ALTITUDINE
//
// IMPORTANT:
// Number(null) = 0 în JavaScript.
// De aceea NU folosim direct Number(...).
// =====================================================

function parseElevation(
  value:
    number |
    string |
    null |
    undefined
): number | null {

  if (
    value === null
    ||
    value === undefined
    ||
    value === ''
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
// NUME VÂRF
// =====================================================

function getPeakName(
  visit: Visit
) {

  const directName =
    visit.place_name
      ?.trim()


  if (
    directName
  ) {

    return directName

  }


  const details =
    visit.location_details
      ?.trim()


  if (
    details
  ) {

    const match =
      details.match(
        /(?:Vârful|Varful|Vf\.?)\s+([^,;()–—-]+)/i
      )


    if (
      match?.[1]
    ) {

      return (
        `Vârful ${
          match[1]
            .trim()
        }`
      )

    }

  }


  return (
    `Vârf ${visit.id}`
  )

}


// =====================================================
// ESTE VÂRF?
//
// Folosim DOAR is_peak.
// Nu mai clasificăm un drum drept vârf doar
// pentru că în descriere apare cuvântul "vârf".
// =====================================================

function isPeakVisit(
  visit: Visit
) {

  return (
    visit.is_peak ===
    true
  )

}


// =====================================================
// VÂRFURI UNICE DIN SUPABASE
// =====================================================

function getBasePeakVisits(
  visits: Visit[]
) {

  const map =
    new Map<
      string,
      PeakVisit
    >()


  for (
    const visit
    of visits
  ) {

    if (
      !isPeakVisit(
        visit
      )
    ) {

      continue

    }


    const name =
      getPeakName(
        visit
      )


    const key =
      normalizePeakName(
        name
      )


    const peak:
      PeakVisit = {

      id:
        visit.id,

      name,

      elevation:
        parseElevation(
          visit.peak_elevation
        ),

      mountainRange:
        visit.mountain_range
          ?.trim()
        ||
        null,

      date:
        getVisitDate(
          visit
        )

    }


    const existing =
      map.get(
        key
      )


    if (
      !existing
    ) {

      map.set(
        key,
        peak
      )

      continue

    }


    const existingTime =
      existing.date
        ?.getTime()
      ??
      Number.POSITIVE_INFINITY


    const currentTime =
      peak.date
        ?.getTime()
      ??
      Number.POSITIVE_INFINITY


    map.set(
      key,
      {

        ...existing,

        date:
          currentTime <
          existingTime

            ? peak.date

            : existing.date,

        elevation:
          existing.elevation
          ??
          peak.elevation,

        mountainRange:
          existing.mountainRange
          ??
          peak.mountainRange

      }
    )

  }


  return Array.from(
    map.values()
  )

}


// =====================================================
// WIKIDATA - SEARCH
// =====================================================

async function wikidataSearch(
  search: string,
  language:
    'ro' |
    'en'
) {

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


  return Array.isArray(
    data.search
  )

    ? data.search

    : []

}


// =====================================================
// WIKIDATA - ENTITĂȚI
// =====================================================

async function getWikidataEntities(
  ids: string[]
): Promise<WikidataEntity[]> {

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

    .filter(
      Boolean
    )

}


// =====================================================
// WIKIDATA - LABEL
// =====================================================

function getEntityLabel(
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
// WIKIDATA - NUME + ALIASURI
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
    of entity.aliases
      ?.ro
    ??
    []
  ) {

    names.add(
      alias.value
    )

  }


  for (
    const alias
    of entity.aliases
      ?.en
    ??
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
// WIKIDATA - CLAIM ITEM
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
      (
        claim:
          any
      ) =>
        claim
          ?.mainsnak
          ?.datavalue
          ?.value
          ?.id
    )

    .filter(
      (
        value:
          unknown
      ): value is string =>
        typeof value ===
        'string'
    )

}


// =====================================================
// WIKIDATA - CLAIM ALTITUDINE
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
// WIKIDATA - SCOR NUME
// =====================================================

function getNameScore(
  candidate:
    string,
  requested:
    string
) {

  const a =
    normalizePeakName(
      candidate
    )


  const b =
    normalizePeakName(
      requested
    )


  if (
    a === b
  ) {

    return 0

  }


  if (
    a.startsWith(
      `${b} `
    )
  ) {

    return 3

  }


  if (
    a.includes(
      b
    )
    ||
    b.includes(
      a
    )
  ) {

    return 8

  }


  return 100

}


// =====================================================
// WIKIDATA - METADATE VÂRF
// =====================================================

async function findPeakMetadata(
  peakName: string
): Promise<PeakMetadata> {

  const cacheKey =
    normalizePeakName(
      peakName
    )


  const cached =
    peakMetadataCache.get(
      cacheKey
    )


  if (
    cached
  ) {

    return cached

  }


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


    const [
      roResults,
      enResults
    ] =
      await Promise.all([

        wikidataSearch(
          cleanName,
          'ro'
        ),

        wikidataSearch(
          cleanName,
          'en'
        )

      ])


    const ids =
      Array.from(
        new Set(
          [
            ...roResults,
            ...enResults
          ]
            .map(
              (
                item:
                  any
              ) =>
                item.id
            )
        )
      )
        .slice(
          0,
          20
        )


    const entities =
      await getWikidataEntities(
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
          null
      }


      peakMetadataCache.set(
        cacheKey,
        empty
      )


      return empty

    }


    const ranked =
      entities

        .map(
          (
            entity
          ) => {

            const names =
              getEntityNames(
                entity
              )


            const bestNameScore =
              Math.min(
                ...names.map(
                  (
                    name
                  ) =>
                    getNameScore(
                      name,
                      cleanName
                    )
                ),
                100
              )


            const elevation =
              getQuantityClaim(
                entity,
                'P2044'
              )


            const rangeIds =
              getItemClaimIds(
                entity,
                'P4552'
              )


            const description =
              normalizeText(
                `${
                  entity.descriptions
                    ?.ro
                    ?.value
                  ??
                  ''
                } ${
                  entity.descriptions
                    ?.en
                    ?.value
                  ??
                  ''
                }`
              )


            let score =
              bestNameScore *
              100


            if (
              elevation !==
              null
            ) {

              score -=
                250

            }


            if (
              rangeIds.length >
              0
            ) {

              score -=
                180

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
                'varf'
              )
              ||
              description.includes(
                'munte'
              )
            ) {

              score -=
                150

            }


            return {
              entity,
              score,
              elevation,
              rangeIds
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
          null
      }

    }


    let mountainRange:
      string | null =
      null


    if (
      best.rangeIds.length >
      0
    ) {

      const rangeEntities =
        await getWikidataEntities(
          best.rangeIds
        )


      if (
        rangeEntities[0]
      ) {

        mountainRange =
          getEntityLabel(
            rangeEntities[0]
          )

      }

    }


    const metadata = {

      elevation:
        best.elevation,

      mountainRange

    }


    peakMetadataCache.set(
      cacheKey,
      metadata
    )


    return metadata

  }

  catch (
    error
  ) {

    console.log(
      'Statistici Wikidata:',
      error
    )


    return {
      elevation:
        null,
      mountainRange:
        null
    }

  }

}


// =====================================================
// COMPONENTĂ
// =====================================================

function Statistics({
  visits
}: StatisticsProps) {


  const basePeakVisits =
    useMemo(
      () =>
        getBasePeakVisits(
          visits
        ),
      [
        visits
      ]
    )


  const [
    peakVisits,
    setPeakVisits
  ] =
    useState<
      PeakVisit[]
    >(
      basePeakVisits
    )


  const [
    enriching,
    setEnriching
  ] =
    useState(
      false
    )


  // ===================================================
  // COMPLETĂM AUTOMAT ALTITUDINEA + MASIVUL
  // DACĂ LIPSESC ÎN SUPABASE
  // ===================================================

  useEffect(
    () => {

      let cancelled =
        false


      async function enrichPeaks() {

        setPeakVisits(
          basePeakVisits
        )


        const needsData =
          basePeakVisits.filter(
            (
              peak
            ) =>
              peak.elevation ===
              null
              ||
              !peak.mountainRange
          )


        if (
          needsData.length ===
          0
        ) {

          setEnriching(
            false
          )

          return

        }


        setEnriching(
          true
        )


        const enriched =
          await Promise.all(

            basePeakVisits.map(

              async (
                peak
              ) => {

                if (
                  peak.elevation !==
                  null
                  &&
                  peak.mountainRange
                ) {

                  return peak

                }


                const metadata =
                  await findPeakMetadata(
                    peak.name
                  )


                const finalPeak = {

                  ...peak,

                  elevation:
                    peak.elevation
                    ??
                    metadata.elevation,

                  mountainRange:
                    peak.mountainRange
                    ??
                    metadata.mountainRange

                }


                // =====================================
                // PERSISTĂM DATELE GĂSITE ÎN SUPABASE
                // ca următoarea încărcare să fie rapidă.
                // =====================================

                const updateData:
                  Record<
                    string,
                    any
                  > = {}


                if (
                  peak.elevation ===
                  null
                  &&
                  finalPeak.elevation !==
                  null
                ) {

                  updateData
                    .peak_elevation =
                      finalPeak.elevation

                }


                if (
                  !peak.mountainRange
                  &&
                  finalPeak.mountainRange
                ) {

                  updateData
                    .mountain_range =
                      finalPeak.mountainRange

                }


                if (
                  Object.keys(
                    updateData
                  )
                    .length >
                  0
                ) {

                  const {
                    error
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
                        peak.id
                      )


                  if (
                    error
                  ) {

                    console.log(
                      'Eroare update statistici:',
                      error
                    )

                  }

                }


                return finalPeak

              }

            )

          )


        if (
          cancelled
        ) {

          return

        }


        setPeakVisits(
          enriched
        )


        setEnriching(
          false
        )

      }


      enrichPeaks()


      return () => {

        cancelled =
          true

      }

    },
    [
      basePeakVisits
    ]
  )


  // ===================================================
  // RECORD PERSONAL
  // ===================================================

  const highestPeak =
    useMemo(
      () => {

        return (
          peakVisits

            .filter(
              (
                peak
              ) =>
                peak.elevation !==
                null
            )

            .sort(
              (
                a,
                b
              ) =>
                (
                  b.elevation
                  ??
                  0
                )
                -
                (
                  a.elevation
                  ??
                  0
                )
            )[0]

          ??
          null
        )

      },
      [
        peakVisits
      ]
    )


  // ===================================================
  // ALTITUDINE MEDIE
  // ===================================================

  const averageElevation =
    useMemo(
      () => {

        const elevations =
          peakVisits

            .map(
              (
                peak
              ) =>
                peak.elevation
            )

            .filter(
              (
                elevation
              ): elevation is number =>
                elevation !==
                null
            )


        if (
          elevations.length ===
          0
        ) {

          return null

        }


        const total =
          elevations.reduce(
            (
              sum,
              elevation
            ) =>
              sum +
              elevation,
            0
          )


        return Math.round(
          total /
          elevations.length
        )

      },
      [
        peakVisits
      ]
    )


  // ===================================================
  // MASIVE EXPLORATE
  // ===================================================

  const rangeCount =
    useMemo(
      () => {

        return new Set(

          peakVisits

            .map(
              (
                peak
              ) =>
                peak.mountainRange
            )

            .filter(
              (
                range
              ): range is string =>
                Boolean(
                  range
                )
            )

            .map(
              normalizeText
            )

        )
          .size

      },
      [
        peakVisits
      ]
    )


  // ===================================================
  // 1. EVOLUȚIA VÂRFURILOR
  // ===================================================

  const progressData =
    useMemo(
      () => {

        const datedPeaks =
          peakVisits

            .filter(
              (
                peak
              ): peak is PeakVisit & {
                date: Date
              } =>
                peak.date !==
                null
            )

            .sort(
              (
                a,
                b
              ) =>
                a.date.getTime()
                -
                b.date.getTime()
            )


        const monthly =
          new Map<
            string,
            {
              year: number
              month: number
              count: number
            }
          >()


        for (
          const peak
          of datedPeaks
        ) {

          const year =
            peak.date
              .getFullYear()


          const month =
            peak.date
              .getMonth()


          const key =
            `${year}-${month}`


          const existing =
            monthly.get(
              key
            )


          if (
            existing
          ) {

            existing.count +=
              1

          }

          else {

            monthly.set(
              key,
              {
                year,
                month,
                count:
                  1
              }
            )

          }

        }


        let cumulative =
          0


        return Array.from(
          monthly.values()
        )

          .sort(
            (
              a,
              b
            ) =>
              (
                a.year *
                12 +
                a.month
              )
              -
              (
                b.year *
                12 +
                b.month
              )
          )

          .map(
            (
              item
            ) => {

              cumulative +=
                item.count


              return {

                month:
                  `${MONTH_NAMES[item.month]} ${item.year}`,

                total:
                  cumulative

              }

            }
          )

      },
      [
        peakVisits
      ]
    )


  // ===================================================
  // 2. VÂRFURI DUPĂ ALTITUDINE
  // ===================================================

  const altitudeData =
    useMemo(
      () => {

        const buckets = [
          {
            label:
              '< 1000 m',
            min:
              Number.NEGATIVE_INFINITY,
            max:
              999
          },
          {
            label:
              '1000–1499 m',
            min:
              1000,
            max:
              1499
          },
          {
            label:
              '1500–1999 m',
            min:
              1500,
            max:
              1999
          },
          {
            label:
              '2000–2499 m',
            min:
              2000,
            max:
              2499
          },
          {
            label:
              '≥ 2500 m',
            min:
              2500,
            max:
              Number.POSITIVE_INFINITY
          }
        ]


        return buckets.map(
          (
            bucket
          ) => ({

            range:
              bucket.label,

            count:
              peakVisits

                .filter(
                  (
                    peak
                  ) => {

                    if (
                      peak.elevation ===
                      null
                    ) {

                      return false

                    }


                    return (
                      peak.elevation >=
                      bucket.min
                      &&
                      peak.elevation <=
                      bucket.max
                    )

                  }
                )

                .length

          })
        )

      },
      [
        peakVisits
      ]
    )


  const hasAltitudeData =
    altitudeData.some(
      (
        item
      ) =>
        item.count >
        0
    )


  // ===================================================
  // 3. VÂRFURI PE MASIVE
  // ===================================================

  const mountainRangeData =
    useMemo(
      () => {

        const ranges =
          new Map<
            string,
            {
              label: string
              count: number
            }
          >()


        for (
          const peak
          of peakVisits
        ) {

          if (
            !peak.mountainRange
          ) {

            continue

          }


          const key =
            normalizeText(
              peak.mountainRange
            )


          const existing =
            ranges.get(
              key
            )


          if (
            existing
          ) {

            existing.count +=
              1

          }

          else {

            ranges.set(
              key,
              {
                label:
                  peak.mountainRange,

                count:
                  1
              }
            )

          }

        }


        return Array.from(
          ranges.values()
        )

          .sort(
            (
              a,
              b
            ) =>
              b.count -
              a.count
          )

          .map(
            (
              item
            ) => ({

              mountainRange:
                item.label,

              count:
                item.count

            })
          )

      },
      [
        peakVisits
      ]
    )


  // ===================================================
  // 4. ACTIVITATE LUNARĂ
  // ===================================================

  const monthlyActivityData =
    useMemo(
      () => {

        const monthly =
          new Map<
            string,
            {
              year: number
              month: number
              count: number
            }
          >()


        for (
          const visit
          of visits
        ) {

          const date =
            getVisitDate(
              visit
            )


          if (
            !date
          ) {

            continue

          }


          const year =
            date.getFullYear()


          const month =
            date.getMonth()


          const key =
            `${year}-${month}`


          const existing =
            monthly.get(
              key
            )


          if (
            existing
          ) {

            existing.count +=
              1

          }

          else {

            monthly.set(
              key,
              {
                year,
                month,
                count:
                  1
              }
            )

          }

        }


        return Array.from(
          monthly.values()
        )

          .sort(
            (
              a,
              b
            ) =>
              (
                a.year *
                12 +
                a.month
              )
              -
              (
                b.year *
                12 +
                b.month
              )
          )

          .map(
            (
              item
            ) => ({

              month:
                `${MONTH_NAMES[item.month]} ${item.year}`,

              visits:
                item.count

            })
          )

      },
      [
        visits
      ]
    )


  const mostExploredRange =
    mountainRangeData[0]
    ??
    null


  const hasAnyData =
    visits.length >
    0


  // ===================================================
  // UI
  // ===================================================

  return (

    <div className="statistics-page">


      <div className="statistics-header">

        <div>

          <p className="statistics-eyebrow">
            PeakQuest
          </p>

          <h1>
            Statisticile mele
          </h1>

          <p className="statistics-description">

            {
              enriching
                ? 'Completez automat datele lipsă despre vârfuri...'
                : 'Progresul tău montan, calculat automat din locurile salvate.'
            }

          </p>

        </div>

      </div>


      {/* =================================================
          CARDURI
      ================================================= */}

      <div className="statistics-cards">


        <article className="stat-card">

          <div className="stat-icon">
            🏔️
          </div>

          <div>

            <span className="stat-label">
              Vârfuri vizitate
            </span>

            <strong className="stat-value">
              {
                peakVisits.length
              }
            </strong>

          </div>

        </article>


        <article className="stat-card">

          <div className="stat-icon">
            🏆
          </div>

          <div>

            <span className="stat-label">
              Record personal
            </span>

            <strong className="stat-value">

              {
                highestPeak
                  ?.elevation !==
                null
                &&
                highestPeak
                  ?.elevation !==
                undefined

                  ? `${highestPeak.elevation} m`

                  : '—'
              }

            </strong>


            {
              highestPeak
              &&
              (

                <span className="stat-detail">
                  {
                    highestPeak.name
                  }
                </span>

              )
            }

          </div>

        </article>


        <article className="stat-card">

          <div className="stat-icon">
            🗻
          </div>

          <div>

            <span className="stat-label">
              Masive explorate
            </span>

            <strong className="stat-value">
              {
                rangeCount
              }
            </strong>


            {
              mostExploredRange
              &&
              (

                <span className="stat-detail">

                  Favorit: {
                    mostExploredRange
                      .mountainRange
                  }

                </span>

              )
            }

          </div>

        </article>


        <article className="stat-card">

          <div className="stat-icon">
            📍
          </div>

          <div>

            <span className="stat-label">
              Vizite totale
            </span>

            <strong className="stat-value">
              {
                visits.length
              }
            </strong>


            {
              averageElevation !==
              null
              &&
              (

                <span className="stat-detail">

                  Medie vârfuri: {
                    averageElevation
                  } m

                </span>

              )
            }

          </div>

        </article>


      </div>


      {
        !hasAnyData
        ? (

          <div className="statistics-empty">

            <span>
              🏔️
            </span>

            <h2>
              Încă nu există date
            </h2>

            <p>
              Adaugă fotografii cu locații GPS, iar graficele se vor completa automat.
            </p>

          </div>

        )
        : (

          <div className="statistics-grid">


            {/* =============================================
                1. EVOLUȚIE
            ============================================= */}

            <article className="chart-card chart-card-wide">

              <div className="chart-card-header">

                <div>

                  <span className="chart-kicker">
                    Progres
                  </span>

                  <h2>
                    Evoluția vârfurilor vizitate
                  </h2>

                </div>

                <span className="chart-badge">
                  📈
                </span>

              </div>


              {
                progressData.length >
                0

                  ? (

                    <div className="chart-container">

                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >

                        <LineChart
                          data={
                            progressData
                          }
                          margin={{
                            top:
                              10,
                            right:
                              18,
                            left:
                              -12,
                            bottom:
                              4
                          }}
                        >

                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={
                              false
                            }
                            opacity={
                              0.22
                            }
                          />

                          <XAxis
                            dataKey="month"
                            tickLine={
                              false
                            }
                            axisLine={
                              false
                            }
                            minTickGap={
                              24
                            }
                          />

                          <YAxis
                            allowDecimals={
                              false
                            }
                            tickLine={
                              false
                            }
                            axisLine={
                              false
                            }
                          />

                          <Tooltip />

                          <Line
                            type="monotone"
                            dataKey="total"
                            name="Vârfuri"
                            stroke="currentColor"
                            strokeWidth={
                              3
                            }
                            dot={{
                              r:
                                4
                            }}
                            activeDot={{
                              r:
                                6
                            }}
                          />

                        </LineChart>

                      </ResponsiveContainer>

                    </div>

                  )
                  : (

                    <p className="chart-empty">
                      Nu există încă vârfuri cu o dată disponibilă.
                    </p>

                  )
              }

            </article>


            {/* =============================================
                2. ALTITUDINE
            ============================================= */}

            <article className="chart-card">

              <div className="chart-card-header">

                <div>

                  <span className="chart-kicker">
                    Altitudine
                  </span>

                  <h2>
                    Vârfuri după altitudine
                  </h2>

                </div>

                <span className="chart-badge">
                  ⛰️
                </span>

              </div>


              {
                enriching
                  ? (

                    <p className="chart-empty">
                      ⏳ Caut altitudinile lipsă...
                    </p>

                  )
                  : hasAltitudeData

                    ? (

                      <div className="chart-container">

                        <ResponsiveContainer
                          width="100%"
                          height="100%"
                        >

                          <BarChart
                            data={
                              altitudeData
                            }
                            margin={{
                              top:
                                10,
                              right:
                                8,
                              left:
                                -12,
                              bottom:
                                26
                            }}
                          >

                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={
                                false
                              }
                              opacity={
                                0.22
                              }
                            />

                            <XAxis
                              dataKey="range"
                              tickLine={
                                false
                              }
                              axisLine={
                                false
                              }
                              interval={
                                0
                              }
                              angle={
                                -18
                              }
                              textAnchor="end"
                              height={
                                58
                              }
                            />

                            <YAxis
                              allowDecimals={
                                false
                              }
                              tickLine={
                                false
                              }
                              axisLine={
                                false
                              }
                            />

                            <Tooltip />

                            <Bar
                              dataKey="count"
                              name="Vârfuri"
                              fill="currentColor"
                              radius={[
                                8,
                                8,
                                0,
                                0
                              ]}
                            />

                          </BarChart>

                        </ResponsiveContainer>

                      </div>

                    )
                    : (

                      <p className="chart-empty">
                        Nu am găsit încă altitudini pentru vârfurile tale.
                      </p>

                    )
              }

            </article>


            {/* =============================================
                3. MASIVE
            ============================================= */}

            <article className="chart-card">

              <div className="chart-card-header">

                <div>

                  <span className="chart-kicker">
                    Explorare
                  </span>

                  <h2>
                    Vârfuri pe masive
                  </h2>

                </div>

                <span className="chart-badge">
                  🗻
                </span>

              </div>


              {
                enriching
                  ? (

                    <p className="chart-empty">
                      ⏳ Caut masivele lipsă...
                    </p>

                  )
                  : mountainRangeData.length >
                    0

                    ? (

                      <div className="chart-container">

                        <ResponsiveContainer
                          width="100%"
                          height="100%"
                        >

                          <BarChart
                            data={
                              mountainRangeData
                            }
                            layout="vertical"
                            margin={{
                              top:
                                10,
                              right:
                                14,
                              left:
                                16,
                              bottom:
                                4
                            }}
                          >

                            <CartesianGrid
                              strokeDasharray="3 3"
                              horizontal={
                                false
                              }
                              opacity={
                                0.22
                              }
                            />

                            <XAxis
                              type="number"
                              allowDecimals={
                                false
                              }
                              tickLine={
                                false
                              }
                              axisLine={
                                false
                              }
                            />

                            <YAxis
                              type="category"
                              dataKey="mountainRange"
                              width={
                                105
                              }
                              tickLine={
                                false
                              }
                              axisLine={
                                false
                              }
                            />

                            <Tooltip />

                            <Bar
                              dataKey="count"
                              name="Vârfuri"
                              fill="currentColor"
                              radius={[
                                0,
                                8,
                                8,
                                0
                              ]}
                            />

                          </BarChart>

                        </ResponsiveContainer>

                      </div>

                    )
                    : (

                      <p className="chart-empty">
                        Nu am găsit încă masivul pentru vârfurile tale.
                      </p>

                    )
              }

            </article>


            {/* =============================================
                4. ACTIVITATE LUNARĂ
            ============================================= */}

            <article className="chart-card chart-card-wide">

              <div className="chart-card-header">

                <div>

                  <span className="chart-kicker">
                    Activitate
                  </span>

                  <h2>
                    Vizite pe luni
                  </h2>

                </div>

                <span className="chart-badge">
                  📅
                </span>

              </div>


              {
                monthlyActivityData.length >
                0

                  ? (

                    <div className="chart-container">

                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >

                        <BarChart
                          data={
                            monthlyActivityData
                          }
                          margin={{
                            top:
                              10,
                            right:
                              16,
                            left:
                              -12,
                            bottom:
                              8
                          }}
                        >

                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={
                              false
                            }
                            opacity={
                              0.22
                            }
                          />

                          <XAxis
                            dataKey="month"
                            tickLine={
                              false
                            }
                            axisLine={
                              false
                            }
                            minTickGap={
                              20
                            }
                          />

                          <YAxis
                            allowDecimals={
                              false
                            }
                            tickLine={
                              false
                            }
                            axisLine={
                              false
                            }
                          />

                          <Tooltip />

                          <Bar
                            dataKey="visits"
                            name="Vizite"
                            fill="currentColor"
                            radius={[
                              8,
                              8,
                              0,
                              0
                            ]}
                          />

                        </BarChart>

                      </ResponsiveContainer>

                    </div>

                  )
                  : (

                    <p className="chart-empty">
                      Nu există încă vizite cu dată disponibilă.
                    </p>

                  )
              }

            </article>


          </div>

        )
      }


    </div>

  )

}


export default Statistics
