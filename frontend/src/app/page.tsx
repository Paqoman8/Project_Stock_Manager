export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center">
      <div className="bg-surface p-8 rounded border border-borderLight shadow-sm max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold mb-2">GStock</h1>
        <p className="text-textMuted mb-6 text-sm">ERP de Gestion Commerciale Centralisée</p>
        
        <button className="bg-primary text-white px-4 py-2 rounded text-sm font-medium hover:bg-opacity-90 transition-opacity w-full">
          Connexion
        </button>
      </div>
    </main>
  );
}
