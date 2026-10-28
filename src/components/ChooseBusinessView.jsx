function ChooseBusinessView({ brands, selectedBrandId, onBrandChange, onContinue }) {
  return (
    <section
      aria-labelledby="choose-business-heading"
      className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8"
    >
      <h1
        id="choose-business-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Choose Business
      </h1>

      <p className="mt-2 text-sm text-text-secondary">
        Select a client brand to continue with the SMS credit reload.
      </p>

      <label
        htmlFor="brand-select"
        className="mt-8 block text-sm font-medium"
      >
        Client Brand
      </label>

      <select
        id="brand-select"
        value={selectedBrandId}
        onChange={(event) => onBrandChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-border-strong bg-surface px-3 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      >
        <option value="">Select a brand</option>

        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!selectedBrandId}
        onClick={onContinue}
        className="mt-7 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-surface hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
      >
        Continue
      </button>
    </section>
  )
}

export default ChooseBusinessView
