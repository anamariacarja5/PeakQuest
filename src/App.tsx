import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
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

const PEAK_SEARCH_RADIUS = 450
const PEAK_ACCEPT_DISTANCE = 250
const LOOKUP_TIMEOUT = 3000

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


// =====================================================
// ICON MUNTE
// =====================================================

const mountainIcon = divIcon({
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

  className: 'mountain-marker',

  iconSize: [42, 42],

  iconAnchor: [21, 38],

  popupAnchor: [0, -38]
})


// =====================================================
// CONTROL HARTĂ
// =====================================================

type MapControllerProps = {
  selectedVisit: any | null
  resetSignal: number
}


function MapController({
  selectedVisit,
  resetSignal
}: MapControllerProps) {

  const map = useMap()


  // ===================================================
  // MERGEM LA LOCAȚIA CĂUTATĂ
  // ===================================================

  useEffect(() => {

    if (!selectedVisit) {
      return
    }


    const latitude =
      Number(selectedVisit.latitude)


    const longitude =
      Number(selectedVisit.longitude)


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

    if (resetSignal === 0) {
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

  const [user, setUser] =
    useState<any>(null)

  const [visits, setVisits] =
    useState<any[]>([])

  const [processing, setProcessing] =
    useState(false)

  const [status, setStatus] =
    useState('')

  const [profileOpen, setProfileOpen] =
    useState(false)

  const [searchTerm, setSearchTerm] =
    useState('')

  const [selectedVisit, setSelectedVisit] =
    useState<any | null>(null)

  const [resetMapSignal, setResetMapSignal] =
    useState(0)

  const [addPopupOpen, setAddPopupOpen] =
    useState(false)

  const [mobileToolsOpen, setMobileToolsOpen] =
    useState(false)

  const [mobileSearchOpen, setMobileSearchOpen] =
    useState(false)

  const [
    selectedImageUrl,
    setSelectedImageUrl
  ] = useState<string | null>(null)


  // ===================================================
  // AUTENTIFICARE
  // ===================================================

  useEffect(() => {

    getCurrentUser()


    const { data } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {

          setUser(
            session?.user ?? null
          )

        }
      )


    return () => {

      data.subscription.unsubscribe()

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
      window.clearTimeout(timer)
    }

  }, [status])


  // ===================================================
  // CURĂȚĂM URL-UL FOTOGRAFIEI
  // ===================================================

  useEffect(() => {

    return () => {

      if (
        selectedImageUrl &&
        selectedImageUrl.startsWith('blob:')
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
      data: { user }
    } =
      await supabase.auth.getUser()


    setUser(user)

  }


  // ===================================================
  // CITIM LOCAȚIILE
  // ===================================================

  async function getVisits() {

    const { data, error } =
      await supabase
        .from('visits')
        .select('*')
        .order(
          'created_at',
          {
            ascending: false
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
      data ?? []
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


    const { error } =
      await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(
          filePath,
          file,
          {
            cacheControl: '3600',

            upsert: false,

            contentType:
              file.type ||
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

    if (!visit.image_path) {

      alert(
        'Această locație nu are o fotografie salvată.'
      )

      return

    }


    const {
      data,
      error
    } =
      await supabase.storage
        .from(PHOTO_BUCKET)
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
      URL.createObjectURL(data)


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
      selectedImageUrl.startsWith('blob:')
    ) {

      URL.revokeObjectURL(
        selectedImageUrl
      )

    }


    setSelectedImageUrl(null)

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
      lat1 * Math.PI / 180


    const lat2Rad =
      lat2 * Math.PI / 180


    const deltaLat =
      (lat2 - lat1) *
      Math.PI /
      180


    const deltaLon =
      (lon2 - lon1) *
      Math.PI /
      180


    const a =
      Math.sin(deltaLat / 2) *
      Math.sin(deltaLat / 2)
      +
      Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2)


    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      )


    return earthRadius * c

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
        String(value)
          .replace(',', '.')
      )


    if (
      !Number.isFinite(parsed)
    ) {

      return null

    }


    return Math.round(parsed)

  }


  // ===================================================
  // FETCH CU TIMEOUT
  // ===================================================

  async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = LOOKUP_TIMEOUT
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

      window.clearTimeout(timer)

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
        `https://nominatim.openstreetmap.org/reverse?` +
        `lat=${latitude}` +
        `&lon=${longitude}` +
        `&format=jsonv2` +
        `&zoom=18` +
        `&addressdetails=1` +
        `&extratags=1` +
        `&namedetails=1` +
        `&accept-language=ro`


      const response =
        await fetchWithTimeout(
          url,
          {},
          LOOKUP_TIMEOUT
        )


      if (!response.ok) {

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
          data.display_name ||
          'Loc vizitat',

        name:
          data.name ||
          data.namedetails?.name ||
          null,

        category:
          data.category ||
          null,

        type:
          data.type ||
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
          data.address?.mountain_range
          ||
          data.extratags?.['is_in:mountains']
          ||
          data.extratags?.['is_in:mountain_range']
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

        name: null,

        category: null,

        type: null,

        latitude: null,

        longitude: null,

        elevation: null,

        mountainRange: null
      }

    }

  }


  // ===================================================
  // CĂUTARE VÂRF
  // ===================================================

  async function getNearbyPeak(
    latitude: number,
    longitude: number
  ): Promise<PeakInfo | null> {

    try {

      const query = `
        [out:json][timeout:3];

        node(
          around:${PEAK_SEARCH_RADIUS},
          ${latitude},
          ${longitude}
        )
        ["natural"="peak"];

        out body;
      `


      const response =
        await fetchWithTimeout(
          'https://overpass-api.de/api/interpreter',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded'
            },

            body:
              new URLSearchParams({
                data: query
              })
          },
          LOOKUP_TIMEOUT
        )


      if (!response.ok) {

        return null

      }


      const data =
        await response.json()


      if (
        !data.elements ||
        data.elements.length === 0
      ) {

        return null

      }


      let nearestPeak:
        PeakInfo | null = null


      for (
        const element
        of data.elements
      ) {

        if (
          typeof element.lat !== 'number'
          ||
          typeof element.lon !== 'number'
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
            element.tags?.['name:ro']
            ||
            element.tags?.name
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

          distance:
            distance,

          mountainRange:
            element.tags?.['is_in:mountains']
            ||
            element.tags?.['is_in:mountain_range']
            ||
            element.tags?.mountain_range
            ||
            null
        }


        if (
          !nearestPeak ||
          peak.distance <
          nearestPeak.distance
        ) {

          nearestPeak =
            peak

        }

      }


      if (
        nearestPeak &&
        nearestPeak.distance <=
        PEAK_ACCEPT_DISTANCE
      ) {

        return nearestPeak

      }


      return null

    }

    catch (error) {

      console.log(
        'Eroare Overpass:',
        error
      )


      return null

    }

  }


  // ===================================================
  // NOMINATIM SPUNE CĂ ESTE VÂRF
  // ===================================================

  function peakFromReverseLocation(
    location: ReverseLocation,
    photoLatitude: number,
    photoLongitude: number
  ): PeakInfo | null {

    if (
      location.category !== 'natural'
      ||
      location.type !== 'peak'
    ) {

      return null

    }


    const peakLatitude =
      location.latitude ??
      photoLatitude


    const peakLongitude =
      location.longitude ??
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
      PEAK_ACCEPT_DISTANCE
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
  // ADĂUGARE FOTOGRAFIE
  // ===================================================

  async function handlePhoto(
    file: File
  ) {

    setProcessing(true)

    setStatus(
      '📷 Citesc coordonatele GPS...'
    )


    try {

      const gps =
        await exifr.gps(file)


      if (!gps) {

        alert(
          'Fotografia nu conține coordonate GPS.'
        )

        setStatus('')

        return

      }


      const latitude =
        gps.latitude


      const longitude =
        gps.longitude


      setStatus(
        `✅ GPS detectat: ` +
        `${latitude.toFixed(6)}, ` +
        `${longitude.toFixed(6)} — ` +
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


      const peak =
        nominatimPeak
        ??
        overpassPeak


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


      let detectedInfo = ''


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
${Math.round(peak.distance)} m`

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


      const { error } =
        await supabase
          .from('visits')
          .insert({

            user_id:
              user.id,

            latitude,

            longitude,

            place_name:
              placeName,

            location_details:
              locationDetails,

            is_peak:
              isPeak,

            peak_elevation:
              peak?.elevation ??
              null,

            mountain_range:
              mountainRange,

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


        await supabase.storage
          .from(PHOTO_BUCKET)
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

      setProcessing(false)

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
        error: photoError
      } =
        await supabase.storage
          .from(PHOTO_BUCKET)
          .remove([
            visit.image_path
          ])


      if (photoError) {

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


    const { error } =
      await supabase
        .from('visits')
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

      setSelectedVisit(null)

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
      .normalize('NFD')
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
              `${visit.place_name ?? ''} ` +
              `${visit.location_details ?? ''} ` +
              `${visit.description ?? ''}`
            )


          return searchableText
            .includes(query)

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

      setSelectedVisit(null)


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
        foundVisit.place_name ||
        'locația vizitată'
      }`
    )


    return true

  }


  // ===================================================
  // RESET HARTĂ
  // ===================================================

  function resetMap() {

    setSelectedVisit(null)

    setSearchTerm('')

    setResetMapSignal(
      (value) =>
        value + 1
    )

  }


  // ===================================================
  // LOGOUT
  // ===================================================

  async function logout() {

    await supabase.auth.signOut()

  }


  // ===================================================
  // LOGIN
  // ===================================================

  if (!user) {

    return <Auth />

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

          <div className="visit-title">

            {visit.is_peak
              ? '🏔️'
              : '📍'
            }

            {' '}

            {visit.place_name ||
              'Loc vizitat'
            }

          </div>


          {visit.image_path && (

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

          )}


          <div className="visit-info">

            {visit.is_peak && (

              <>

                <strong>
                  Altitudine:
                </strong>

                {' '}

                {visit.peak_elevation !== null
                  ? `${visit.peak_elevation} m`
                  : 'necunoscută'
                }

                <br />


                <strong>
                  Masiv:
                </strong>

                {' '}

                {visit.mountain_range ||
                  'nedetectat'
                }

                <br />


                {visit.location_details && (

                  <>

                    <br />

                    <strong>
                      Locație / traseu:
                    </strong>

                    <br />

                    {visit.location_details}

                    <br />

                  </>

                )}

                <br />

              </>

            )}


            <strong>
              Data:
            </strong>

            {' '}

            {visit.visit_date}

            <br />


            <strong>
              Latitudine:
            </strong>

            {' '}

            {visit.latitude}

            <br />


            <strong>
              Longitudine:
            </strong>

            {' '}

            {visit.longitude}

          </div>


          <div className="popup-bottom">

            <div className="description">

              <strong>
                Descriere:
              </strong>

              <br />

              {visit.description ||
                'Fără descriere'
              }

            </div>


            <button
              className="delete-button"

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


          {profileOpen && (

            <div className="user-dropdown">

              <button
                className="logout-button"
                onClick={logout}
              >

                ↪ Deconectare

              </button>

            </div>

          )}

        </div>

      </header>


      {/* =================================================
          HARTA
      ================================================= */}

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

            {processing
              ? '⏳ Identific locația...'
              : '📷 Adaugă fotografie'
            }


            <input
              type="file"
              accept="image/*"
              disabled={processing}

              style={{
                display: 'none'
              }}

              onChange={(e) => {

                const file =
                  e.target.files?.[0]


                if (file) {

                  handlePhoto(file)

                }


                e.target.value = ''

              }}
            />

          </label>


          {status && (

            <div
              className={
                status.includes('✅')
                  ? 'status-box success'
                  : 'status-box'
              }
            >

              {status}

            </div>

          )}


          <div className="search-row">

            <div className="search-box">

              <span className="search-icon">
                🔍
              </span>


              <input
                type="text"
                placeholder="Caută un loc vizitat..."
                value={searchTerm}

                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }

                onKeyDown={(e) => {

                  if (
                    e.key === 'Enter'
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

            if (mobileToolsOpen) {

              setMobileSearchOpen(
                false
              )

            }

          }}
        >

          ◎

        </button>


        {/* =================================================
            MOBIL - CELE DOUĂ BUTOANE
        ================================================= */}

        {mobileToolsOpen && (

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

        )}


        {/* =================================================
            POPUP SEARCH MOBIL
        ================================================= */}

        {mobileSearchOpen && (

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

                  value={searchTerm}

                  onChange={(e) =>
                    setSearchTerm(
                      e.target.value
                    )
                  }

                  onKeyDown={(e) => {

                    if (
                      e.key === 'Enter'
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

        )}


        {/* =================================================
            POPUP ADAUGĂ FOTOGRAFIE
        ================================================= */}

        {addPopupOpen && (

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

                {processing
                  ? '⏳ Identific locația...'
                  : '📷 Alege fotografia'
                }


                <input
                  type="file"
                  accept="image/*"
                  disabled={processing}

                  style={{
                    display: 'none'
                  }}

                  onChange={(e) => {

                    const file =
                      e.target.files?.[0]


                    if (file) {

                      setAddPopupOpen(
                        false
                      )


                      handlePhoto(
                        file
                      )

                    }


                    e.target.value = ''

                  }}
                />

              </label>

            </div>

          </div>

        )}


        {/* =================================================
            STATUS MOBIL
        ================================================= */}

        {status && (

          <div
            className={
              status.includes('✅')
                ? 'mobile-map-status success'
                : 'mobile-map-status'
            }
          >

            {status}

          </div>

        )}


        {/* =================================================
            HARTA LEAFLET
        ================================================= */}

        <MapContainer
          center={
            ROMANIA_CENTER
          }

          zoom={7}

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


          {visits.map(
            (visit) => {

              if (
                visit.is_peak
              ) {

                return (

                  <Marker
                    key={visit.id}

                    position={[
                      visit.latitude,
                      visit.longitude
                    ]}

                    icon={
                      mountainIcon
                    }
                  >

                    {visitPopup(
                      visit
                    )}

                  </Marker>

                )

              }


              return (

                <Marker
                  key={visit.id}

                  position={[
                    visit.latitude,
                    visit.longitude
                  ]}
                >

                  {visitPopup(
                    visit
                  )}

                </Marker>

              )

            }
          )}

        </MapContainer>

      </div>


      {/* =================================================
          PREVIEW FOTOGRAFIE
      ================================================= */}

      {selectedImageUrl && (

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

      )}

    </div>

  )

}


export default App