import { redirect } from 'next/navigation'

/** Connexion SaaS retirée — entrée directe sur le PIN staff. */
export default function HomePage() {
  redirect('/staff')
}
