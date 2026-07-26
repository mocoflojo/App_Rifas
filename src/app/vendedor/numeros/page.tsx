export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display-mobile text-primary">Números</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low px-6 py-12 text-center">
        <span className="material-symbols-outlined text-[40px] text-outline">grid_view</span>
        <p className="text-body-sm text-on-surface-variant">
          Esta vista se construye en una fase posterior.
        </p>
      </div>
    </div>
  );
}
