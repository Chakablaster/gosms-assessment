import Dropdown from './Dropdown'

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

      <div className="mt-8">
        <Dropdown
          id="brand-select"
          label="Client Brand"
          options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
          value={selectedBrandId}
          onChange={onBrandChange}
          placeholder="Select a brand"
        />
      </div>

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
