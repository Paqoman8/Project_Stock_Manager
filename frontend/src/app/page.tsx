import Link from 'next/link';
import { APP_NAME, APP_DESCRIPTION } from '@/lib/config/app';

export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center">
      <div className="bg-surface p-8 rounded border border-borderLight shadow-sm max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold mb-2">{APP_NAME}</h1>
        <p className="text-textMuted mb-6 text-sm">{APP_DESCRIPTION}</p>

        {/*
          Le bouton est un lien de navigation vers la page de connexion.
          Il n'y a pas de page d'inscription : les comptes sont créés par un administrateur.
        */}
        <Link
          id="btn-accueil-connexion"
          href="/login"
          className="block bg-primary text-white px-4 py-2 rounded text-sm font-medium hover:bg-opacity-90 transition-opacity w-full text-center"
        >
          Connexion
        </Link>
      </div>
    </main>
  );
}
