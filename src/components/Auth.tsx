import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'


function Auth() {

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  // Devine true când userul intră
  // din emailul de recuperare
  const [resetMode, setResetMode] = useState(false)

  const [newPassword, setNewPassword] = useState('')


  // Verificăm dacă utilizatorul a venit
  // din linkul "Reset password"
  useEffect(() => {

    const { data } = supabase.auth.onAuthStateChange(
      (event) => {

        if (event === 'PASSWORD_RECOVERY') {

          setResetMode(true)

          setMessage(
            'Introdu noua parolă.'
          )

        }

      }
    )


    return () => {

      data.subscription.unsubscribe()

    }

  }, [])



  // REGISTER
  async function register() {

    if (!email || !password) {

      setMessage(
        'Completează emailul și parola.'
      )

      return

    }


    const { error } =
      await supabase.auth.signUp({

        email: email,
        password: password

      })


    if (error) {

      setMessage(error.message)

    }

    else {

      setMessage(
        'Cont creat! Verifică emailul dacă este necesar.'
      )

    }

  }



  // LOGIN
  async function login() {

    if (!email || !password) {

      setMessage(
        'Completează emailul și parola.'
      )

      return

    }


    const { error } =
      await supabase.auth.signInWithPassword({

        email: email,
        password: password

      })


    if (error) {

      setMessage(error.message)

    }

    else {

      setMessage(
        'Te-ai autentificat!'
      )

    }

  }



  // AM UITAT PAROLA
  async function forgotPassword() {

    if (!email) {

      setMessage(
        'Introdu mai întâi adresa de email.'
      )

      return

    }


    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: window.location.origin
        }
      )


    if (error) {

      setMessage(error.message)

    }

    else {

      setMessage(
        'Ți-am trimis un email pentru resetarea parolei.'
      )

    }

  }



  // SALVĂM PAROLA NOUĂ
  async function changePassword() {

    if (!newPassword) {

      setMessage(
        'Introdu noua parolă.'
      )

      return

    }


    if (newPassword.length < 6) {

      setMessage(
        'Parola trebuie să aibă cel puțin 6 caractere.'
      )

      return

    }


    const { error } =
      await supabase.auth.updateUser({

        password: newPassword

      })


    if (error) {

      setMessage(error.message)

    }

    else {

      setMessage(
        'Parola a fost schimbată cu succes!'
      )

      setResetMode(false)
      setNewPassword('')

    }

  }



  // Dacă userul a venit din emailul
  // pentru resetarea parolei
  if (resetMode) {

    return (

      <div>

        <h1>
          PeakQuest 🏔️
        </h1>


        <h2>
          Schimbă parola
        </h2>


        <input

          type="password"

          placeholder="Parola nouă"

          value={newPassword}

          onChange={(e) =>
            setNewPassword(e.target.value)
          }

        />


        <br />
        <br />


        <button
          onClick={changePassword}
        >

          Salvează parola nouă

        </button>


        <p>
          {message}
        </p>

      </div>

    )

  }



  // PAGINA NORMALĂ LOGIN / REGISTER
  return (

    <div>

      <h1>
        PeakQuest 🏔️
      </h1>


      <h2>
        Login / Register
      </h2>


      <input

        type="email"

        placeholder="Email"

        value={email}

        onChange={(e) =>
          setEmail(e.target.value)
        }

      />


      <br />
      <br />


      <input

        type="password"

        placeholder="Parolă"

        value={password}

        onChange={(e) =>
          setPassword(e.target.value)
        }

      />


      <br />
      <br />


      <button
        onClick={login}
      >

        Login

      </button>


      {' '}


      <button
        onClick={register}
      >

        Register

      </button>


      <br />
      <br />


      <button
        onClick={forgotPassword}
        style={{
          color: 'black'
        }}
      >

        Am uitat parola

      </button>


      <p>
        {message}
      </p>

    </div>

  )

}


export default Auth