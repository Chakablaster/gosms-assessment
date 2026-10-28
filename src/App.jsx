import { useState } from 'react'
import ChooseBusinessView from './components/ChooseBusinessView'
import SmsTopUpView from './components/SmsTopUpView'
import { brands, companies, outlets } from './data/mockData'
import { validateCreditAmount, calculateTotalCredits } from './logic/credits'

function App() {
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [showTopUp, setShowTopUp] = useState(false)
  const [creditsByOutlet, setCreditsByOutlet] = useState({})

  const selectedBrand = brands.find(
    (brand) => brand.id === selectedBrandId
  )

  const selectedOutlets = outlets
    .filter((outlet) => outlet.brandId === selectedBrandId)
    .map((outlet) => ({
      ...outlet,
      companyName:
        companies.find(
          (company) => company.id === outlet.companyId
        )?.name ?? 'Company unavailable',
    }))

  const errorsByOutlet = Object.fromEntries(
    selectedOutlets.map((outlet) => [
      outlet.id,
      validateCreditAmount(creditsByOutlet[outlet.id] ?? '0'),
    ])
  )

  const totalCredits = calculateTotalCredits(
    selectedOutlets,
    creditsByOutlet
  )

  function handleBrandChange(brandId) {
    if (brandId !== selectedBrandId) {
      setCreditsByOutlet({})
    }

    setSelectedBrandId(brandId)
  }

  function handleCreditChange(outletId, value) {
    setCreditsByOutlet((previous) => ({
      ...previous,
      [outletId]: value,
    }))
  }

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <span className="text-xl font-bold tracking-tight text-brand">
            GoSMS
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {showTopUp ? (
          <SmsTopUpView
            selectedBrandName={selectedBrand?.name ?? ''}
            onChangeBrand={() => setShowTopUp(false)}
            outlets={selectedOutlets}
            creditsByOutlet={creditsByOutlet}
            errorsByOutlet={errorsByOutlet}
            onCreditChange={handleCreditChange}
            onReset={() => setCreditsByOutlet({})}
            totalCredits={totalCredits}
          />
        ) : (
          <ChooseBusinessView
            brands={brands}
            selectedBrandId={selectedBrandId}
            onBrandChange={handleBrandChange}
            onContinue={() => {
              if (selectedBrand) setShowTopUp(true)
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
