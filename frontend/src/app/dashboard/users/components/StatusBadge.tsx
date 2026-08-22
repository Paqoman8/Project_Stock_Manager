export default function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
      Actif
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-danger/10 text-danger opacity-70">
      Inactif
    </span>
  );
}
