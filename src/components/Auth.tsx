import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import authBg from '../assets/auth-bg.png'

import './Auth.css'

function Auth() {

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [errorMessage, setErrorMessage] =
    useState('')

  const [resetMode, setResetMode] =
    useState(false)


  // =====================================================
  // DETECTĂM LINK-UL DE RESETARE PAROLĂ
  // =====================================================

  useEffect(() => {

    const {
      data: {
        subscription
      }
    } =
      supabase.auth.onAuthStateChange(
        (event) => {

          if (
            event === 'PASSWORD_RECOVERY'
          ) {

            setResetMode(true)

            setMessage(
              'Introdu parola nouă.'
            )

          }

        }
      )


    return () => {

      subscription.unsubscribe()

    }

  }, [])



  // =====================================================
  // CURĂȚARE MESAJE
  // =====================================================

  function clearMessages() {

    setMessage('')
    setErrorMessage('')

  }



  // =====================================================
  // LOGIN
  // =====================================================

  async function login() {

    clearMessages()


    if (
      !email.trim() ||
      !password
    ) {

      setErrorMessage(
        'Completează emailul și parola.'
      )

      return

    }


    setLoading(true)


    const { error } =
      await supabase.auth
        .signInWithPassword({

          email:
            email.trim(),

          password:
            password

        })


    setLoading(false)


    if (error) {

      setErrorMessage(
        'Email sau parolă incorectă.'
      )

    }

  }



  // =====================================================
  // REGISTER
  // =====================================================

  async function register() {

    clearMessages()


    if (
      !email.trim() ||
      !password
    ) {

      setErrorMessage(
        'Completează emailul și parola.'
      )

      return

    }


    if (
      password.length < 6
    ) {

      setErrorMessage(
        'Parola trebuie să aibă minimum 6 caractere.'
      )

      return

    }


    setLoading(true)


    const { error } =
      await supabase.auth
        .signUp({

          email:
            email.trim(),

          password:
            password

        })


    setLoading(false)


    if (error) {

      setErrorMessage(
        error.message
      )

      return

    }


    setMessage(
      'Contul a fost creat. Verifică emailul pentru confirmare.'
    )

  }



  // =====================================================
  // AM UITAT PAROLA
  // =====================================================

  async function forgotPassword() {

    clearMessages()


    if (!email.trim()) {

      setErrorMessage(
        'Introdu mai întâi adresa de email.'
      )

      return

    }


    setLoading(true)


    const { error } =
      await supabase.auth
        .resetPasswordForEmail(
          email.trim(),
          {
            redirectTo:
              window.location.origin
          }
        )


    setLoading(false)


    if (error) {

      setErrorMessage(
        error.message
      )

      return

    }


    setMessage(
      'Ți-am trimis un link pentru resetarea parolei.'
    )

  }



  // =====================================================
  // SALVARE PAROLĂ NOUĂ
  // =====================================================

  async function saveNewPassword() {

    clearMessages()


    if (
      !password ||
      !confirmPassword
    ) {

      setErrorMessage(
        'Completează ambele câmpuri.'
      )

      return

    }


    if (
      password !==
      confirmPassword
    ) {

      setErrorMessage(
        'Parolele nu coincid.'
      )

      return

    }


    if (
      password.length < 6
    ) {

      setErrorMessage(
        'Parola trebuie să aibă minimum 6 caractere.'
      )

      return

    }


    setLoading(true)


    const { error } =
      await supabase.auth
        .updateUser({

          password:
            password

        })


    setLoading(false)


    if (error) {

      setErrorMessage(
        error.message
      )

      return

    }


    setMessage(
      'Parola a fost schimbată cu succes.'
    )

  }



  // =====================================================
  // RESET PASSWORD
  // =====================================================

  if (resetMode) {

    return (

      <div className="auth-page">

        <div className="auth-content">


          <div className="auth-logo">

            PeakQuest

            <span className="auth-logo-mountain">
              🏔️
            </span>

          </div>


          <h1 className="auth-title">
            Reset Password
          </h1>


          <div className="auth-card">


            <div className="auth-field">

              <label htmlFor="new-password">
                New Password
              </label>


              <input
                id="new-password"

                type="password"

                value={password}

                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
              />

            </div>


            <div className="auth-field">

              <label htmlFor="confirm-password">
                Confirm Password
              </label>


              <input
                id="confirm-password"

                type="password"

                value={confirmPassword}

                onChange={(e) =>
                  setConfirmPassword(
                    e.target.value
                  )
                }
              />

            </div>


            {message && (

              <div className="auth-message success">
                {message}
              </div>

            )}


            {errorMessage && (

              <div className="auth-message error">
                {errorMessage}
              </div>

            )}


            <button
              className="auth-login-button"

              type="button"

              disabled={loading}

              onClick={
                saveNewPassword
              }
            >

              {loading
                ? 'Se salvează...'
                : 'Salvează parola'
              }

            </button>


          </div>

        </div>

      </div>

    )

  }



  // =====================================================
  // LOGIN / REGISTER
  // =====================================================

  return (

    <div  className="auth-page"
          style={{
            backgroundImage: `
              linear-gradient(
                rgba(8, 13, 23, 0.20),
                rgba(8, 12, 20, 0.35)
              ),
              url(${authBg})
            `
      }}>


      <div className="auth-content">


        {/* LOGO */}

        <div className="auth-logo">

          PeakQuest

          <span className="auth-logo-mountain">
            🏔️
          </span>

        </div>



        {/* TITLU */}

        <h1 className="auth-title">

          Login / Register

        </h1>



        {/* CARD */}

        <div className="auth-card">


          {/* EMAIL */}

          <div className="auth-field">

            <label htmlFor="email">
              Email
            </label>


            <input
              id="email"

              type="email"

              value={email}

              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }

              autoComplete="email"
            />

          </div>



          {/* PASSWORD */}

          <div className="auth-field">

            <label htmlFor="password">
              Password
            </label>


            <input
              id="password"

              type="password"

              value={password}

              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }

              autoComplete="current-password"
            />

          </div>



          {/* MESAJ SUCCES */}

          {message && (

            <div className="auth-message success">

              {message}

            </div>

          )}



          {/* MESAJ EROARE */}

          {errorMessage && (

            <div className="auth-message error">

              {errorMessage}

            </div>

          )}



          {/* LOGIN */}

          <button
            className="auth-login-button"

            type="button"

            disabled={loading}

            onClick={login}
          >

            {loading
              ? 'Please wait...'
              : 'Login'
            }

          </button>



          {/* REGISTER */}

          <button
            className="auth-register-button"

            type="button"

            disabled={loading}

            onClick={register}
          >

            Register

          </button>



          {/* FORGOT PASSWORD */}

          <button
            className="auth-forgot-button"

            type="button"

            disabled={loading}

            onClick={
              forgotPassword
            }
          >

            Am uitat parola

          </button>


        </div>

      </div>


      <div className="auth-decoration">
        ✦
      </div>


    </div>

  )

}


export default Auth