import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import exifr from 'exifr'

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup
} from 'react-leaflet'

import { divIcon } from 'leaflet'

import 'leaflet/dist/leaflet.css'


// =====================================================
// SETĂRI
// =====================================================

// Căutăm vârfuri în jurul fotografiei
const PEAK_SEARCH_RADIUS = 450

// Considerăm că fotografia este "la vârf"
// doar dacă vârful este suficient de aproape.
// Asta evită ca o poză făcută pe traseu,
// la 600-700 m de un vârf, să fie clasificată
// greșit drept fotografie de vârf.
const PEAK_ACCEPT_DISTANCE = 250

// Nu lăsăm serviciile online
// să țină aplicația blocată prea mult.
const LOOKUP_TIMEOUT = 3000


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
// ICON PENTRU VÂRF
// =====================================================

// IMPORTANT:
// Acesta este DOAR emoji-ul.
// Nu are pin-ul albastru Leaflet.

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

  className: '',

  iconSize: [42, 42],

  iconAnchor: [21, 38],

  popupAnchor: [0, -38]

})


// =====================================================
// APP
// =====================================================

function App() {

  const [user, setUser] =
    useState<any>(null)

  const [visits, setVisits] =
    useState<any[]>([])

  const [processing, setProcessing] =
    useState(false)

  const [status, setStatus] =
    useState('')


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



  async function getCurrentUser() {

    const {
      data: { user }
    } =
      await supabase.auth.getUser()

    setUser(user)

  }


  // ===================================================
  // CITIM LOCAȚIILE USERULUI
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


    setVisits(data ?? [])

  }


  // ===================================================
  // DISTANȚĂ ÎNTRE DOUĂ COORDONATE
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
      Math.PI / 180

    const deltaLon =
      (lon2 - lon1) *
      Math.PI / 180


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
  // TRANSFORMĂ ALTITUDINEA ÎN NUMĂR
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
          signal: controller.signal
        }
      )

    }

    finally {

      window.clearTimeout(timer)

    }

  }


  // ===================================================
  // NOMINATIM
  //
  // AFLĂM LOCAȚIA / TRASEUL / ZONA
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
        Number.parseFloat(data.lat)

      const detectedLongitude =
        Number.parseFloat(data.lon)


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
          data.address?.mountain_range ||
          data.extratags?.['is_in:mountains'] ||
          data.extratags?.['is_in:mountain_range'] ||
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
  // OVERPASS
  //
  // CĂUTĂM VÂRF ÎN APROPIERE
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
          typeof element.lat !== 'number' ||
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


        const peak: PeakInfo = {

          name:
            element.tags?.['name:ro'] ||
            element.tags?.name ||
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
            element.tags?.['is_in:mountains'] ||
            element.tags?.['is_in:mountain_range'] ||
            element.tags?.mountain_range ||
            null

        }


        if (
          !nearestPeak ||
          peak.distance <
          nearestPeak.distance
        ) {

          nearestPeak = peak

        }

      }


      // Foarte important:
      // Nu considerăm orice vârf aflat
      // în raza de căutare drept locația fotografiei.

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
  // DACĂ NOMINATIM SPUNE DIRECT CĂ ESTE PEAK
  // ===================================================

  function peakFromReverseLocation(
    location: ReverseLocation,
    photoLatitude: number,
    photoLongitude: number
  ): PeakInfo | null {

    if (
      location.category !== 'natural' ||
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
        location.name ||
        location.displayName
          .split(',')[0] ||
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

      // ===============================================
      // 1. GPS DIN FOTOGRAFIE
      // ===============================================

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


      // COORDONATELE SUNT DEJA GĂSITE AICI.
      // Nu mai așteptăm serviciile online pentru GPS.

      setStatus(
        `✅ GPS detectat instant: ` +
        `${latitude.toFixed(6)}, ` +
        `${longitude.toFixed(6)} — ` +
        `identific locația...`
      )


      // ===============================================
      // 2. LOC + VÂRF ÎN PARALEL
      // ===============================================

      const [
        location,
        overpassPeak
      ] = await Promise.all([

        getReverseLocation(
          latitude,
          longitude
        ),

        getNearbyPeak(
          latitude,
          longitude
        )

      ])


      // ===============================================
      // 3. VERIFICĂM DACĂ NOMINATIM A IDENTIFICAT
      //    DIRECT UN VÂRF
      // ===============================================

      const nominatimPeak =
        peakFromReverseLocation(
          location,
          latitude,
          longitude
        )


      // Dacă Nominatim spune direct peak,
      // îi dăm prioritate.
      // Altfel folosim rezultatul Overpass.

      const peak =
        nominatimPeak ??
        overpassPeak


      const isPeak =
        peak !== null


      // ===============================================
      // 4. NUMELE
      // ===============================================

      const placeName =
        peak
          ? peak.name
          : location.displayName


      const locationDetails =
        location.displayName


      const mountainRange =
        peak?.mountainRange ??
        location.mountainRange ??
        null


      // ===============================================
      // 5. ARĂTĂM REZULTATUL
      // ===============================================

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

Distanță față de poziția vârfului:
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


      // ===============================================
      // 6. DESCRIERE
      // ===============================================

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


      // ===============================================
      // 7. SALVARE SUPABASE
      // ===============================================

      setStatus(
        '💾 Salvez locația...'
      )


      const { error } =
        await supabase
          .from('visits')
          .insert({

            user_id:
              user.id,

            // IMPORTANT:
            // markerul rămâne la GPS-ul fotografiei,
            // nu îl mutăm pe coordonatele OSM.
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
              peak?.elevation ??
              null,

            mountain_range:
              mountainRange,

            description:
              description,

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


        alert(
          'Punctul nu a putut fi salvat.'
        )

        return

      }


      // ===============================================
      // 8. ACTUALIZARE HARTĂ
      // ===============================================

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
    visitId: number
  ) {

    const confirmed =
      window.confirm(
        'Sigur vrei să ștergi această locație de pe hartă?'
      )


    if (!confirmed) {

      return

    }


    const { error } =
      await supabase
        .from('visits')
        .delete()
        .eq(
          'id',
          visitId
        )


    if (error) {

      console.log(
        'Eroare la ștergere:',
        error
      )


      alert(
        'Locația nu a putut fi ștearsă.'
      )

      return

    }


    await getVisits()

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
  // POPUP
  // ===================================================

  function visitPopup(
    visit: any
  ) {

    return (

      <Popup>

        <div
          style={{
            minWidth: '260px'
          }}
        >


          {/* NUMELE */}

          <strong>

            {visit.is_peak
              ? '🏔️'
              : '📍'
            }

            {' '}

            {visit.place_name ||
              'Loc vizitat'
            }

          </strong>


          <br />
          <br />


          {/* LOCAȚIE / TRASEU */}

          {visit.is_peak &&
            visit.location_details && (

            <>

              <strong>
                Locație / traseu:
              </strong>

              <br />

              {visit.location_details}

              <br />
              <br />

            </>

          )}


          {/* DATE VÂRF */}

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
              <br />

            </>

          )}


          {/* DATA */}

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


          <br />
          <br />


          {/* DESCRIERE + DELETE */}

          <div
            style={{

              display: 'flex',

              justifyContent:
                'space-between',

              alignItems:
                'flex-end',

              gap:
                '15px'

            }}
          >


            <div>

              <strong>
                Descriere:
              </strong>

              <br />

              {visit.description
                ? visit.description
                : 'Fără descriere'
              }

            </div>


            <button

              onClick={() =>
                deleteVisit(
                  visit.id
                )
              }

              style={{

                color:
                  '#b00020',

                backgroundColor:
                  'white',

                border:
                  '1px solid #b00020',

                padding:
                  '4px 7px',

                cursor:
                  'pointer',

                fontSize:
                  '11px',

                fontWeight:
                  'bold'

              }}

            >

              DELETE

            </button>

          </div>

        </div>

      </Popup>

    )

  }


  // ===================================================
  // PAGINA PRINCIPALĂ
  // ===================================================

  return (

    <div>

      <h1>
        PeakQuest 🏔️
      </h1>


      <p>
        Logat ca: {user.email}
      </p>


      <button
        onClick={logout}
      >
        Logout
      </button>


      <br />
      <br />


      {/* ADĂUGARE FOTOGRAFIE */}

      <label

        style={{

          color:
            'black',

          backgroundColor:
            'white',

          border:
            '1px solid gray',

          padding:
            '10px 20px',

          cursor:
            processing
              ? 'not-allowed'
              : 'pointer',

          display:
            'inline-block',

          opacity:
            processing
              ? 0.6
              : 1

        }}

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


            // Putem selecta din nou
            // aceeași fotografie.
            e.target.value = ''

          }}

        />

      </label>


      {/* STATUS */}

      {status && (

        <p
          style={{
            marginTop: '10px'
          }}
        >

          {status}

        </p>

      )}


      <br />


      {/* HARTA */}

      <MapContainer

        center={[
          45.8,
          24.9
        ]}

        zoom={7}

        style={{

          height:
            '600px',

          width:
            '100%'

        }}

      >


        <TileLayer

          attribution="&copy; OpenStreetMap contributors"

          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

        />


        {visits.map(
          (visit) => {


            // ===========================================
            // VÂRF MONTAN
            //
            // FOARTE IMPORTANT:
            // are DOAR emoji-ul 🏔️
            // ===========================================

            if (visit.is_peak) {

              return (

                <Marker

                  key={visit.id}

                  position={[
                    visit.latitude,
                    visit.longitude
                  ]}

                  icon={mountainIcon}

                >

                  {visitPopup(visit)}

                </Marker>

              )

            }


            // ===========================================
            // LOCAȚIE NORMALĂ
            //
            // NU punem icon={...}
            // Leaflet folosește pin-ul normal.
            // ===========================================

            return (

              <Marker

                key={visit.id}

                position={[
                  visit.latitude,
                  visit.longitude
                ]}

              >

                {visitPopup(visit)}

              </Marker>

            )

          }
        )}


      </MapContainer>

    </div>

  )

}


export default App